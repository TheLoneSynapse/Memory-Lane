/**
 * The Memory Lane data store.
 *
 * Everything the app knows lives in one JSON document on disk
 * (server/data/db.json by default). It is small, human-readable and easy to
 * reset — perfect for a demo, and it keeps the API stateless between requests.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESTINATIONS, createSeed } from "./seed.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.MEMORY_LANE_DATA_DIR
  ? path.resolve(process.env.MEMORY_LANE_DATA_DIR)
  : path.join(here, "data");

export const DB_FILE = path.join(DATA_DIR, "db.json");

/** @type {ReturnType<typeof createSeed> | null} */
let db = null;

/**
 * Fills in anything an older (or partial) db.json is missing, so the store can
 * always be read without defensive checks at every call site.
 */
function normalizeDb(raw) {
  const seed = createSeed();
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    schemaVersion: seed.schemaVersion,
    // The person themselves: name, what they like to be called, a line about
    // them. Empty until the welcome step answers — an empty profile is a real
    // answer (they chose "skip"), so a missing field falls back only.
    profile: {
      name: typeof source.profile?.name === "string" ? source.profile.name : "",
      preferredName:
        typeof source.profile?.preferredName === "string"
          ? source.profile.preferredName
          : "",
      about: typeof source.profile?.about === "string" ? source.profile.about : "",
    },
    people: Array.isArray(source.people) && source.people.length ? source.people : seed.people,
    // An empty array is a real answer — the last story was taken off the shelf
    // on purpose — so only a missing (or broken) field falls back to the seed.
    stories: Array.isArray(source.stories) ? source.stories : seed.stories,
    home: {
      // An empty array is a real answer — the last moment was taken off on
      // purpose — so only a missing (or broken) field falls back to the seed.
      // Moments written before ids existed get a stable one from their place.
      moments: Array.isArray(source.home?.moments)
        ? source.home.moments
            .filter((moment) => moment && typeof moment === "object")
            .map((moment, index) => ({ ...moment, id: moment.id || `moment-${index}` }))
        : seed.home.moments,
    },
    defaultTodayEvents: Array.isArray(source.defaultTodayEvents)
      ? source.defaultTodayEvents
      : seed.defaultTodayEvents,
    upcomingEvents: Array.isArray(source.upcomingEvents) ? source.upcomingEvents : seed.upcomingEvents,
    memories: Array.isArray(source.memories)
      ? source.memories.map((memory) => normalizeMemory(memory)).filter(Boolean)
      : [],
    schedule: {
      events:
        source.schedule && typeof source.schedule.events === "object" && source.schedule.events
          ? source.schedule.events
          : {},
      removedIds: Array.isArray(source.schedule?.removedIds) ? source.schedule.removedIds : [],
      changes: Array.isArray(source.schedule?.changes) ? source.schedule.changes : [],
    },
  };
}

/** Repairs a stored memory card (destinations are the only field that changed shape). */
function normalizeMemory(card) {
  if (!card || typeof card !== "object" || typeof card.id !== "string") return null;
  return {
    id: card.id,
    name: typeof card.name === "string" ? card.name : "",
    metNote: typeof card.metNote === "string" ? card.metNote : "",
    caption: typeof card.caption === "string" && card.caption ? card.caption : "A new memory",
    createdAt:
      typeof card.createdAt === "string" && card.createdAt
        ? card.createdAt
        : new Date().toISOString(),
    photoDataUrl: typeof card.photoDataUrl === "string" ? card.photoDataUrl : null,
    destinations:
      Array.isArray(card.destinations) && card.destinations.length
        ? card.destinations.filter((id) => DESTINATIONS.includes(id))
        : ["home"],
  };
}

function persist() {
  mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  renameSync(temp, DB_FILE);
}

/** Reads the database, creating it from the seed on first use. */
export function readDb() {
  if (db) return db;
  if (existsSync(DB_FILE)) {
    try {
      db = normalizeDb(JSON.parse(readFileSync(DB_FILE, "utf8")));
      return db;
    } catch (error) {
      console.error(`[memory-lane] could not read ${DB_FILE}, starting from the seed:`, error.message);
    }
  }
  db = createSeed();
  persist();
  return db;
}

/** Ensures the data file exists so the server can report where it writes. */
export function ensureDataFile() {
  readDb();
  return DB_FILE;
}

/**
 * Applies a change to the database and writes it back to disk.
 * The mutator may return a value, which is passed through to the caller.
 */
export function mutate(mutator) {
  const current = readDb();
  const result = mutator(current);
  persist();
  return result;
}

/** Throws the given database away and starts again from the seed. */
export function resetDb() {
  db = createSeed();
  persist();
  return db;
}

/* ------------------------------------------------------------------ */
/* Domain helpers                                                      */
/* ------------------------------------------------------------------ */

/** The local calendar day as "YYYY-MM-DD". */
export function isoDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * An event belongs to today when it carries no date (everything written before
 * dates existed reads this way) or today's date. Anything else belongs to
 * another day and must not show up under "Today".
 */
export function isTodayEvent(event, now = new Date()) {
  if (!event || !event.date) return true;
  return event.date === isoDay(now);
}

/**
 * Today's schedule: the default events (minus any the user removed) with their
 * rewrites applied, followed by brand-new events in the order they were added.
 * Mirrors the merge the frontend used to do in localStorage.
 */
export function mergeTodayEvents(database = readDb()) {
  const { events, removedIds } = database.schedule;
  const defaultIds = new Set(database.defaultTodayEvents.map((event) => event.id));
  // A removed id hides the event without destroying it: a default one still
  // lives in defaultTodayEvents, an added one still lives in events. That is
  // what lets a family member see what was taken off the day.
  const removed = new Set(removedIds);

  const defaults = database.defaultTodayEvents
    .filter((event) => !removed.has(event.id))
    .map((event) => events[event.id] ?? event);

  const custom = Object.entries(events)
    .filter(([id]) => !defaultIds.has(id) && !removed.has(id))
    .map(([, event]) => event);

  return [...defaults, ...custom];
}

/** Escapes a phrase so it can be looked for literally inside a RegExp. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `haystack` mentions `phrase` as a whole word (or two), not a fragment. */
function mentions(haystack, phrase) {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}([^a-z0-9]|$)`);
  return pattern.test(haystack);
}

/**
 * Which face in the circle a piece of writing is about: "meeting with Frank",
 * "Call Rithu", "Lunch with Ruby Marsh".
 *
 * An event only earns the contact chip on its card when it is linked to a
 * person, and most events are written — by the editor or said out loud to the
 * companion — without anyone ever picking one. So whoever is named in the
 * wording is who the event belongs to. The longest mention wins, so a full
 * name beats a first name that is also in the circle; nobody named gives "".
 */
export function matchPersonId(database, ...texts) {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase().trim();
  if (!haystack) return "";

  let bestId = "";
  let bestLength = 0;

  for (const person of database.people ?? []) {
    const name = (person.name ?? "").trim().toLowerCase();
    if (name.length < 2) continue;

    // The full name first, then the first name on its own — "Ruby" finds
    // "Ruby is coming for lunch" without needing the surname written down.
    const variants = [name, ...name.split(/\s+/)].filter((word) => word.length >= 2);
    for (const variant of variants) {
      if (variant.length > bestLength && mentions(haystack, variant)) {
        bestLength = variant.length;
        bestId = person.id;
      }
    }
  }

  return bestId;
}

/**
 * Appends one entry to the schedule's change log.
 *
 * Nothing prunes this list: it is the record of what the day used to say, and
 * it is what a family member reads to see what was moved or taken off.
 */
export function recordScheduleChange(database, change) {
  const entry = {
    id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...change,
  };
  database.schedule.changes = [entry, ...(database.schedule.changes ?? [])];
  return entry;
}

/** A stable "memory of the day" — the same one for the whole calendar day. */
export function memoryOfTheDay(moments, now = new Date()) {
  if (!moments.length) return null;
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  return moments[dayIndex % moments.length];
}
