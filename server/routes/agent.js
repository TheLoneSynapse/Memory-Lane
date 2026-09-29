/**
 * The Memory Lane voice assistant.
 *
 * Two kinds of route live here, and they are deliberately in one file because
 * they describe one thing — the companion.
 *
 *   Session  GET  /api/agent/config   how the browser should open the call
 *            POST /api/agent/token    a short-lived AssemblyAI token
 *
 *   Tools    GET  /api/agent/now      the day, the date and the time of day
 *            GET  /api/agent/context  today, what's coming, memory of the day
 *            GET  /api/agent/person   one familiar face, by name or relationship
 *            GET  /api/agent/memories search the saved memories
 *            GET  /api/agent/define   what a word means
 *            GET  /api/agent/search   the search engine, for the rest of the world
 *            POST /api/agent/remember keep a note
 *            POST /api/agent/today    add a reminder to today
 *            POST /api/agent/cancel   take something off today, but keep it
 *            POST /api/agent/move     change when something today happens
 *
 * Cancelling never destroys anything. The event is only marked hidden, and the
 * change is written to `schedule.changes`, which a family member reads through
 * GET /api/schedule/changes (see routes/schedule.js).
 *
 * The tool routes are what the companion calls to answer a question or save
 * something. They are ordinary JSON endpoints: a client-side tool reaches them
 * from the browser on a local run, and an AssemblyAI HTTP tool reaches them
 * over the internet once the app is deployed. The API key never leaves this
 * process — the page only ever gets a single-use token.
 */
import { Router } from "express";
import { HttpError, asyncHandler, shortDate, text } from "../http.js";
import {
  isTodayEvent,
  matchPersonId,
  memoryOfTheDay,
  mergeTodayEvents,
  mutate,
  readDb,
  recordScheduleChange,
} from "../store.js";
import { greetingFor, keyterms, systemPromptFor, persona, turnDetection } from "../agent/persona.js";
import { clientTools } from "../agent/tools.js";

const router = Router();

const agentsApi = () => process.env.AGENTS_API_BASE || "https://agents.assemblyai.com/v1";
const isConfigured = () => Boolean(process.env.ASSEMBLYAI_API_KEY);
const storedAgentId = () => (process.env.AGENT_ID || "").trim();

const SETUP_HINT =
  "The voice assistant is not set up yet. Add ASSEMBLYAI_API_KEY to .env and restart the API.";

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

/** GET /api/agent/config — the agent to speak as, and how to configure it. */
router.get("/config", (req, res) => {
  if (!isConfigured()) {
    res.json({
      enabled: false,
      mode: "inline",
      agentId: null,
      agentName: persona.name,
      session: null,
      reason: SETUP_HINT,
    });
    return;
  }

  // A published id means the companion is managed on the AssemblyAI account:
  // connect to it as it is and let its own tools answer. Otherwise the session
  // is configured inline, and the browser runs the tools.
  const agentId = storedAgentId();
  if (agentId) {
    res.json({
      enabled: true,
      mode: "stored",
      agentId,
      agentName: persona.name,
      session: null,
      reason: null,
    });
    return;
  }

  const db = readDb();
  const terms = keyterms(db);
  res.json({
    enabled: true,
    mode: "inline",
    agentId: null,
    agentName: persona.name,
    reason: null,
    session: {
      system_prompt: systemPromptFor(db),
      greeting: greetingFor(db),
      output: { voice: persona.voice },
      input: {
        ...(terms.length ? { keyterms: terms } : {}),
        turn_detection: turnDetection,
      },
      tools: clientTools(),
    },
  });
});

/** POST /api/agent/token — one single-use token, minted here so the key stays here. */
router.post(
  "/token",
  asyncHandler(async (req, res) => {
    if (!isConfigured()) throw new HttpError(503, SETUP_HINT);

    const url = new URL(`${agentsApi()}/token`);
    url.searchParams.set("expires_in_seconds", "60");

    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` },
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("[memory-lane] voice token request failed:", upstream.status, detail);
      throw new HttpError(502, "The voice assistant could not be reached. Please try again.");
    }

    const { token } = await upstream.json();
    res.json({ token });
  })
);

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/** A short, speech-shaped view of a saved memory. */
function memorySummary(memory) {
  return {
    about: memory.name || "a moment",
    note: memory.metNote || memory.caption,
    savedAt: shortDate(new Date(memory.createdAt)),
  };
}

/**
 * Everyone the person could reasonably mean. Deliberately an array: "my friend"
 * is two people in this family, and the honest answer is to let the companion
 * ask which rather than pick one.
 *
 * Relationships are matched too, so "my daughter" finds Ellen — that is how
 * people with dementia tend to ask, far more often than by name.
 */
/**
 * "Your granddaughter", "my daughter?", "the neighbour" → "granddaughter",
 * "daughter", "neighbour". Applied to both sides so the wording does not have
 * to line up: the store says "Your daughter" and people say "my daughter".
 */
function normalizeRelation(value) {
  return value
    .toLowerCase()
    .replace(/[?.!,]+$/, "")
    .replace(/^(your|my|the|our)\s+/, "")
    .trim();
}

function findPeople(people, wanted) {
  if (!wanted) return [];

  const name = (person) => person.name.toLowerCase();
  const relation = (person) => normalizeRelation(person.relationship);

  const exactName = people.filter((person) => name(person) === wanted);
  if (exactName.length) return exactName;

  const firstName = people.filter((person) => name(person).split(/\s+/)[0] === wanted);
  if (firstName.length) return firstName;

  const exactRelation = people.filter((person) => relation(person) === wanted);
  if (exactRelation.length) return exactRelation;

  // A word inside the relationship, so "the neighbour" and "my old friend" both
  // land. Tolerates a plural, which is how "my grandchildren" arrives.
  const singular = wanted.endsWith("s") ? wanted.slice(0, -1) : wanted;
  const byRelation = people.filter((person) => {
    const words = relation(person).split(/\s+/);
    return words.includes(wanted) || words.includes(singular) || relation(person).includes(singular);
  });
  if (byRelation.length) return byRelation;

  return people.filter(
    (person) => name(person).includes(wanted) || wanted.includes(name(person))
  );
}

/** Whether a saved memory is about the named person. */
function memoryMentions(memory, name) {
  const haystack = `${memory.name} ${memory.metNote} ${memory.caption}`.toLowerCase();
  return haystack.includes(name.toLowerCase());
}

/* -- the time, told the way it would be said out loud ---------------- */

const HOUR_WORDS = [
  "twelve",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
];

/** "just after nine", "quarter to five" — approximate, which is all that helps. */
function spokenTime(date) {
  const hour = date.getHours() % 12;
  const minute = date.getMinutes();
  const thisHour = HOUR_WORDS[hour];
  const nextHour = HOUR_WORDS[(hour + 1) % 12];
  if (minute === 0) return `exactly ${thisHour}`;
  if (minute <= 7) return `just after ${thisHour}`;
  if (minute <= 22) return `quarter past ${thisHour}`;
  if (minute <= 37) return `half past ${thisHour}`;
  if (minute <= 52) return `quarter to ${nextHour}`;
  return `nearly ${nextHour}`;
}

function partOfDay(date) {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function ordinal(value) {
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = value % 100;
  // 11, 12, 13 (and 111, 112, 113 …) are always "th" — the general rule
  // does not apply to them, so they must be caught before the mod-10 path.
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  return `${value}${suffixes[remainder % 10] ?? suffixes[0]}`;
}

/**
 * GET /api/agent/me — who they are, in their own words.
 *
 * The one question a companion must never get wrong: they ask their own name
 * and it answers "I don't know". The details come from the welcome step and
 * the personal-details dialog, so anything they have written is here too.
 */
router.get("/me", (req, res) => {
  const db = readDb();
  const { name, preferredName, about } = db.profile;

  if (!name) {
    res.json({
      known: false,
      hint: "They have not given their name yet. Ask warmly for it and offer to keep it with remember_this.",
    });
    return;
  }

  res.json({
    known: true,
    name,
    preferredName: preferredName || name.split(/\s+/)[0],
    about,
    message: `${name} is the person you are speaking with. They like to be called ${
      preferredName || name.split(/\s+/)[0]
    }.`,
  });
});

/**
 * POST /api/agent/me — keep the name they have just told you.
 *
 * What they say wins: a correction on a call reaches the same profile the
 * welcome step wrote, so the app and the companion never disagree about who
 * this is.
 */
router.post("/me", (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, { field: "name", max: 60 });
  const preferredName = text(body.preferredName, { field: "preferredName", max: 40 });

  if (!name && !preferredName) {
    res.json({ saved: false, error: "There was no name to keep yet. Ask them for it." });
    return;
  }

  const previous = readDb().profile;
  const profile = {
    // A nickname alone is not a name; keep what was already known.
    name: name || previous.name,
    preferredName: preferredName || (name ? "" : previous.preferredName),
    about: previous.about,
  };

  mutate((db) => {
    db.profile = profile;
  });

  const called = profile.preferredName || profile.name.split(/\s+/)[0];
  res.json({
    saved: true,
    name: profile.name,
    preferredName: called,
    message: `Thank you. I will call you ${called} from now on.`,
  });
});

/** GET /api/agent/now — what day it is, and the time of day. */
router.get("/now", (req, res) => {
  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const month = now.toLocaleDateString(undefined, { month: "long" });
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const when = partOfDay(now);

  res.json({
    weekday,
    partOfDay: when,
    date: now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    time,
    // Written to be spoken as it is, so the companion does not read "09:12".
    sentence: `It is ${weekday} ${when}, the ${ordinal(now.getDate())} of ${month}. It is ${spokenTime(now)}.`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

/** GET /api/agent/context — the day at a glance. */
router.get("/context", (req, res) => {
  const db = readDb();
  res.json({
    // Who they are, so a question about themselves never needs a second trip.
    aboutYou: {
      name: db.profile.name,
      preferredName:
        db.profile.preferredName ||
        (db.profile.name ? db.profile.name.split(/\s+/)[0] : ""),
      about: db.profile.about,
    },
    today: mergeTodayEvents(db)
      .filter((event) => isTodayEvent(event))
      .map(({ time, headline, description }) => ({
        time,
        headline,
        description,
      })),
    comingUp: db.upcomingEvents.map(({ day, title }) => ({ day, title })),
    memoryOfTheDay: memoryOfTheDay(db.home.moments),
    people: db.people.map(({ name, relationship }) => ({ name, relationship })),
  });
});

/** The full card for one person, plus anything saved about them. */
function personCard(db, person) {
  return {
    found: true,
    // The app opens the person's own card with this, so a spoken question can
    // bring the right face on screen.
    id: person.id,
    name: person.name,
    relationship: person.relationship,
    about: person.bio,
    lastMet: person.lastMet,
    loves: person.loves,
    somethingToSay: person.conversationStarter,
    savedAboutThem: db.memories
      .filter((memory) => memoryMentions(memory, person.name))
      .map(memorySummary),
  };
}

/** GET /api/agent/person?name=… — one familiar face, by name or relationship. */
router.get("/person", (req, res) => {
  const db = readDb();
  const wanted = normalizeRelation(String(req.query.name ?? ""));
  const matches = findPeople(db.people, wanted);

  if (matches.length === 1) {
    res.json(personCard(db, matches[0]));
    return;
  }

  if (matches.length > 1) {
    res.json({
      found: "several",
      matches: matches.map((person) => ({
        id: person.id,
        name: person.name,
        relationship: person.relationship,
      })),
      hint: "More than one person could be who they mean. Ask which of these they mean, gently.",
    });
    return;
  }

  res.json({
    found: false,
    known: db.people.map((person) => `${person.name} (${person.relationship})`),
    hint: "Nobody matched. Ask which of the known names they mean.",
  });
});

/**
 * Words that say nothing about what was kept — the glue of any question.
 * Matching on them would return everything, which is the same as finding
 * nothing at all.
 */
const NOISE_WORDS = new Set([
  "a", "an", "and", "any", "anything", "are", "about", "did", "do", "does", "for", "from",
  "had", "has", "have", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "our",
  "remember", "remembered", "recall", "some", "something", "tell", "the", "to", "was", "we",
  "what", "when", "where", "which", "who", "why", "with", "you", "your",
]);

/**
 * Spellings the transcriber produces interchangeably. A memory kept as
 * "the harbor" must still be found when it is asked for as "the harbour" —
 * the person does not care which way it was written down.
 */
const SPELLING_PAIRS = [
  ["harbour", "harbor"],
  ["colour", "color"],
  ["neighbour", "neighbor"],
  ["favourite", "favorite"],
  ["centre", "center"],
  ["theatre", "theater"],
  ["grey", "gray"],
];

/** The shape a word must be in to be found. Applied to both sides of a match. */
function searchStem(word) {
  let shaped = word;
  for (const [british, american] of SPELLING_PAIRS) {
    if (shaped === british) shaped = american;
  }
  if (shaped.endsWith("ies") && shaped.length > 4) return `${shaped.slice(0, -3)}y`;
  if (shaped.endsWith("es") && shaped.length > 4) return shaped.slice(0, -2);
  if (shaped.endsWith("s") && !shaped.endsWith("ss") && shaped.length > 3) return shaped.slice(0, -1);
  return shaped;
}

/**
 * The words of a question that are worth searching for: punctuation gone,
 * the glue words dropped, each remaining word in its stored shape. So
 * "Tell me the memory of the harbor, 2019" becomes [harbor, 2019].
 */
function searchWords(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !NOISE_WORDS.has(word))
    .map(searchStem);
}

/** How much of the question this piece of writing answers. */
function matchScore(words, ...parts) {
  if (!words.length) return 1; // No question: everything counts, most recent first.
  const written = new Set(searchWords(parts.join(" ")));
  return words.filter((word) => written.has(word)).length;
}

/** GET /api/agent/memories?about=… — search what has been kept. */
router.get("/memories", (req, res) => {
  const about = String(req.query.about ?? "").trim();
  const words = searchWords(about);
  const db = readDb();

  // Everything the app can hold: the photo library, the written moments on
  // Home, and the told-again stories. If it was entered anywhere in the app,
  // asking about it should find it.
  //
  // Asked word by word rather than as one exact phrase: a question is
  // phrased a dozen ways ("the harbor, 2019", "harbor 2019", "the harbor
  // from 2019"), and finding nothing when it is plainly on screen is worse
  // than finding a little. The closest answers come first.
  const best = (items, toText, limit) =>
    items
      .map((item) => ({ item, score: matchScore(words, ...toText(item)) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => item);

  const matches = best(db.memories, (memory) => [memory.name, memory.metNote, memory.caption], 6);
  const moments = best(db.home.moments, (moment) => [moment.title, moment.text], 6);
  const stories = best(db.stories, (story) => [story.title, story.context, story.story], 4);

  res.json({
    about: about || null,
    found: matches.length + moments.length + stories.length,
    memories: matches.map(memorySummary),
    moments: moments.map((moment) => ({
      about: moment.title,
      note: moment.text,
    })),
    stories: stories.map((story) => ({
      about: story.title,
      note: story.story,
    })),
  });
});

/* -- the wider web: what a word means, and a search engine ----------- */

/**
 * Search providers, chosen by what is in .env and nothing else:
 *
 *   GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CSE_ID  real Google results
 *   BRAVE_SEARCH_API_KEY                          Brave Web Search
 *   neither                                       Wikipedia, which needs no key
 *
 * The keyless one is the default on purpose: the companion should be able to
 * answer "what is the capital of Japan" on a fresh clone, and a provider that
 * costs money to turn on is one that stays off.
 */
const GOOGLE_KEY = () => (process.env.GOOGLE_SEARCH_API_KEY || "").trim();
const GOOGLE_CX = () => (process.env.GOOGLE_SEARCH_CSE_ID || "").trim();
const BRAVE_KEY = () => (process.env.BRAVE_SEARCH_API_KEY || "").trim();

const SEARCH_TIMEOUT = 8_000;

/** One upstream call, timed out rather than left hanging the whole reply. */
async function searchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  });
  if (!response.ok) throw new Error(`upstream said ${response.status}`);
  return response.json();
}

/** The few HTML entities a search engine leaves in its own text. */
const ENTITIES = {
  amp: "&",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  apos: "'",
  "#39": "'",
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
};

/** The markup a search engine wraps around matched words, said out loud. */
function plain(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&([a-z#0-9]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

/** Where a result came from, as a person would name it: "the BBC", "Wikipedia". */
function sourceOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function searchGoogle(query) {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", GOOGLE_KEY());
  url.searchParams.set("cx", GOOGLE_CX());
  url.searchParams.set("q", query);
  url.searchParams.set("num", "5");
  const data = await searchJson(url);
  return (data.items ?? []).map((item) => ({
    title: plain(item.title),
    snippet: plain(item.snippet),
    source: sourceOf(item.link),
  }));
}

async function searchBrave(query) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  const data = await searchJson(url, {
    headers: { "X-Subscription-Token": BRAVE_KEY() },
  });
  return (data.web?.results ?? []).map((item) => ({
    title: plain(item.title),
    snippet: plain(item.description),
    source: sourceOf(item.url),
  }));
}

async function searchWikipedia(query) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", "5");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const data = await searchJson(url);
  return (data.query?.search ?? []).map((item) => ({
    title: plain(item.title),
    snippet: plain(item.snippet),
    source: "Wikipedia",
  }));
}

function searchProvider() {
  if (GOOGLE_KEY() && GOOGLE_CX()) return { name: "google", run: searchGoogle };
  if (BRAVE_KEY()) return { name: "brave", run: searchBrave };
  return { name: "wikipedia", run: searchWikipedia };
}

/**
 * GET /api/agent/search?query=… — the search engine, in one call.
 *
 * Returns summaries rather than links: the answer is spoken, so a URL is of no
 * use to anyone and a page of results is worse than three short ones. The
 * provider is deliberately not named to the model — it only needs to know
 * whether anything came back.
 */
router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const query = text(req.query.query, { field: "query", max: 160 });
    if (!query) {
      res.json({
        found: 0,
        hint: '"query" is required — a few words about what they asked, e.g. capital of France.',
      });
      return;
    }

    const provider = searchProvider();
    let results = [];
    try {
      results = await provider.run(query);
    } catch (error) {
      // A search that fails is still an answer: say so rather than guessing.
      console.error("[memory-lane] web search failed:", error.message);
      res.json({
        found: 0,
        query,
        hint: "The search could not be reached. Tell them gently that you could not look it up — never guess.",
      });
      return;
    }

    res.json({
      found: results.length,
      query,
      results: results.slice(0, 5),
      hint: results.length
        ? "Answer from these in one or two short sentences of your own. Never read out links, lists or whole pages."
        : "Nothing came back. Say so gently and do not guess.",
    });
  })
);

/**
 * GET /api/agent/define?word=… — what a word means.
 *
 * Wiktionary rather than a search engine: a meaning wants the one plain
 * definition, not ten pages about it. Free, no key, and quick enough that the
 * companion does not leave a silence waiting on it. English only, which is the
 * language it speaks; a phrase with no entry is answered by search_the_web
 * instead.
 */
router.get(
  "/define",
  asyncHandler(async (req, res) => {
    const word = text(req.query.word, { field: "word", max: 80 });
    if (!word) {
      res.json({ found: false, hint: '"word" is required — the word they asked about.' });
      return;
    }

    let entries;
    try {
      // Lower case on the way in: Wiktionary titles are lower case, and a
      // capitalised word still lands through its redirect.
      const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(
        word.toLowerCase()
      )}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT),
      });
      // No entry: the honest answer, and a reason to try the search instead.
      if (response.status === 404) {
        res.json({
          found: false,
          word,
          hint: "There is no dictionary entry for that. Try search_the_web, or say you are not sure — never invent a meaning.",
        });
        return;
      }
      if (!response.ok) throw new Error(`Wiktionary said ${response.status}`);
      entries = await response.json();
    } catch (error) {
      console.error("[memory-lane] word lookup failed:", error.message);
      res.json({
        found: false,
        word,
        hint: "The dictionary could not be reached. Say so gently rather than guessing a meaning.",
      });
      return;
    }

    // One definition per sense is all a voice can carry: the first meaning of
    // a word is the common one, and the rest only if they ask again. The HTML
    // in an entry is links and emphasis, so plain() leaves the words behind.
    const meanings = (Array.isArray(entries.en) ? entries.en : [])
      .flatMap((entry) =>
        (entry.definitions ?? []).map((definition) => ({
          partOfSpeech: plain(entry.partOfSpeech),
          definition: plain(definition.definition),
          example: plain(definition.examples?.[0]),
        }))
      )
      .filter(({ definition }) => definition)
      .slice(0, 4);

    if (!meanings.length) {
      res.json({
        found: false,
        word,
        hint: "Nothing usable came back. Try search_the_web, or say you are not sure.",
      });
      return;
    }

    res.json({
      found: true,
      word,
      meanings,
      hint: "Give the first meaning in your own slow words, and only add another if they ask.",
    });
  })
);

/** POST /api/agent/remember — keep a note in the memory library. */
router.post("/remember", (req, res) => {
  const body = req.body ?? {};
  const who = text(body.who, { field: "who", max: 40 });
  const note = text(body.note, { field: "note", max: 280 });

  if (!who && !note) {
    res.json({
      saved: false,
      error: "There was nothing to keep yet. Ask what they would like you to remember.",
    });
    return;
  }

  const card = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: who,
    metNote: note,
    caption: who ? `Remembered · ${who}` : `Remembered · ${shortDate()}`,
    createdAt: new Date().toISOString(),
    photoDataUrl: null,
    destinations: ["home"],
  };

  mutate((db) => {
    db.memories = [card, ...db.memories];
  });

  res.status(201).json({
    saved: true,
    about: who || note,
    kept: note,
    message: "Saved to the memory library, where it will be waiting next time.",
  });
});

/** Words that carry no meaning when matching what a person called something. */
const FILLER = new Set([
  "the",
  "a",
  "an",
  "my",
  "our",
  "your",
  "his",
  "her",
  "their",
  "its",
  "today",
  "tonight",
  "tomorrow",
  "this",
  "that",
  "of",
  "at",
  "on",
  "in",
  "for",
  "to",
  "is",
  "am",
  "are",
  "was",
  "please",
  "and",
  "with",
]);

/**
 * Which of today's events a phrase means. Matched on words, so "Ruby's lunch"
 * finds "Ruby is coming for lunch", and it returns every best-scoring event so
 * an ambiguous phrase can be asked about rather than guessed at.
 */
function matchEvents(events, wanted) {
  const tokens = wanted
    .toLowerCase()
    .split(/[^a-z0-9:]+/)
    .filter((token) => token && !FILLER.has(token));
  if (!tokens.length) return [];

  const scored = events
    .map((event) => {
      const haystack = `${event.headline} ${event.description}`.toLowerCase();
      return { event, score: tokens.filter((token) => haystack.includes(token)).length };
    })
    .filter((candidate) => candidate.score > 0);
  if (!scored.length) return [];

  const best = Math.max(...scored.map((candidate) => candidate.score));
  return scored.filter((candidate) => candidate.score === best).map((candidate) => candidate.event);
}

const snapshot = (event) => ({
  time: event.time,
  headline: event.headline,
  description: event.description,
});

const todayList = (events) => events.map(({ time, headline }) => ({ time, headline }));

/** POST /api/agent/cancel — take something off today, keeping a record of it. */
router.post("/cancel", (req, res) => {
  const body = req.body ?? {};
  const what = text(body.what, { field: "what", max: 120 });
  const reason = text(body.reason, { field: "reason", max: 200 });
  // Only today's events can be "taken off today" — a plan for Saturday is
  // answered by changing its date, not by cancelling it.
  const today = mergeTodayEvents().filter((event) => isTodayEvent(event));
  const matches = matchEvents(today, what);

  if (matches.length !== 1) {
    res.json({
      cancelled: false,
      found: matches.length,
      today: todayList(today),
      hint: matches.length
        ? "More than one thing today could be that. Ask which they mean."
        : "Nothing on today matched. These are what is on today — ask which they mean.",
    });
    return;
  }

  const event = matches[0];

  mutate((database) => {
    // Hidden, never deleted: the id is marked removed and the event itself is
    // left where it was, so the day can be put back and family can see it.
    if (!database.schedule.removedIds.includes(event.id)) {
      database.schedule.removedIds.push(event.id);
    }
    recordScheduleChange(database, {
      by: "companion",
      action: "cancelled",
      eventId: event.id,
      headline: event.headline,
      before: snapshot(event),
      after: null,
      reason,
    });
  });

  res.json({
    cancelled: true,
    what: event.headline,
    time: event.time,
    message: `${event.headline} has been taken off today. The record of it is kept.`,
  });
});

/** POST /api/agent/move — change when something today happens. */
router.post("/move", (req, res) => {
  const body = req.body ?? {};
  const what = text(body.what, { field: "what", max: 120 });
  const time = text(body.time, { field: "time", max: 40 });
  const headline = text(body.headline, { field: "headline", max: 120 });
  const details = text(body.details, { field: "details", max: 400 });
  const reason = text(body.reason, { field: "reason", max: 200 });
  const today = mergeTodayEvents().filter((event) => isTodayEvent(event));
  const matches = matchEvents(today, what);

  if (matches.length !== 1) {
    res.json({
      moved: false,
      found: matches.length,
      today: todayList(today),
      hint: matches.length
        ? "More than one thing today could be that. Ask which they mean."
        : "Nothing on today matched. These are what is on today — ask which they mean.",
    });
    return;
  }

  if (!time && !headline && !details) {
    res.json({ moved: false, error: "There is nothing to change yet. Ask for the new time." });
    return;
  }

  const event = matches[0];
  const after = {
    time: time || event.time,
    headline: headline || event.headline,
    description: details || event.description,
  };
  // Reworded to name someone new? The chip on the card follows the wording;
  // otherwise the event keeps the face it already had.
  const personId = matchPersonId(readDb(), after.headline, after.description) || event.personId || "";

  mutate((database) => {
    database.schedule.events[event.id] = {
      id: event.id,
      ...after,
      // The date the event belongs to is not something a move changes.
      date: event.date ?? "",
      personId,
    };
    recordScheduleChange(database, {
      by: "companion",
      action: "moved",
      eventId: event.id,
      headline: after.headline,
      before: snapshot(event),
      after,
      reason,
    });
  });

  res.json({
    moved: true,
    what: after.headline,
    from: event.time,
    to: after.time,
    message: `${after.headline} is now at ${after.time}.`,
  });
});

/** POST /api/agent/today — add a reminder to today's plan. */
router.post("/today", (req, res) => {
  const body = req.body ?? {};
  const what = text(body.what, { field: "what", max: 120 });

  if (!what) {
    res.json({ added: false, error: '"what" is required — a short headline for the reminder.' });
    return;
  }

  const details = text(body.details, { field: "details", max: 400 });
  // Whoever the arrangement names — "a call with David at seven" — is who the
  // card's contact chip shows, the same way an event written by hand gets one.
  const personId = matchPersonId(readDb(), what, details);

  const event = {
    id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: text(body.time, { field: "time", max: 40 }) || "Anytime",
    headline: what,
    description: details,
    personId,
  };

  mutate((db) => {
    db.schedule.events[event.id] = event;
  });

  const person = readDb().people.find((face) => face.id === personId);
  res.status(201).json({
    added: true,
    time: event.time,
    what: event.headline,
    // Lets the companion say who it is with when it confirms the reminder.
    ...(person ? { with: person.name } : {}),
  });
});

export default router;
