import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { createResource, useResource, type ResourceState } from "./resource";

export interface Person {
  id: string;
  name: string;
  relationship: string;
  initials: string;
  /** CSS gradient used as a stand-in for a real photograph. */
  gradient: string;
  /** A photo of them chosen from the device, shown instead of the gradient. */
  photoDataUrl?: string | null;
  /** "How you know them" bio. */
  bio: string;
  lastMet: string;
  loves: string[];
  conversationStarter: string;
  /** Small "Photographs together" thumbnails. */
  photos: { label: string; gradient: string }[];
}

/** What the face matcher suggests when the user holds up a photograph. */
export interface FaceMatch {
  person: Person;
  confidence: number;
  considered: number;
  /** "photograph" when the user shared one, otherwise "the circle of faces". */
  lookedAt: string;
  matchedAt: string;
}

/** The user's circle, fetched once from the API and kept in memory. */
const people = createResource<Person[]>(() => apiGet<Person[]>("/people"), []);

export function usePeopleState(): ResourceState<Person[]> {
  return useResource(people);
}

export function getPeople(): Person[] {
  return people.getState().data;
}

export function reloadPeople(): Promise<void> {
  return people.reload();
}

/** Finds a person by the name the user typed against a saved photo. */
export function findPersonByName(name: string): Person | undefined {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  return getPeople().find((person) => person.name.trim().toLowerCase() === wanted);
}

export function findPersonById(id: string): Person | undefined {
  if (!id) return undefined;
  return getPeople().find((person) => person.id === id);
}

/** Escapes a phrase so it can be looked for literally inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `haystack` mentions `phrase` as a whole word (or two), not a fragment. */
function mentionsWord(haystack: string, phrase: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}([^a-z0-9]|$)`);
  return pattern.test(haystack);
}

/**
 * Whichever face in the circle a piece of writing names — "meeting with Frank",
 * "Call Rithu", "Lunch with Ruby Marsh". The longest mention wins, so a full
 * name beats a first name that is also in the circle.
 *
 * The server applies the same rule (`matchPersonId` in server/store.js), so an
 * event written in the editor and one saved by the companion out loud end up
 * wearing the same contact chip.
 */
export function matchPersonByText(...texts: (string | undefined | null)[]): Person | undefined {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase().trim();
  if (!haystack) return undefined;

  let best: Person | undefined;
  let bestLength = 0;

  for (const person of getPeople()) {
    const name = person.name.trim().toLowerCase();
    if (name.length < 2) continue;

    const variants = [name, ...name.split(/\s+/)].filter((word) => word.length >= 2);
    for (const variant of variants) {
      if (variant.length > bestLength && mentionsWord(haystack, variant)) {
        bestLength = variant.length;
        best = person;
      }
    }
  }

  return best;
}

/**
 * Asks the service who is in a photograph. The response also carries the
 * circle of faces, so a match always has a full person card to show.
 */
export async function matchPhoto(photoDataUrl: string | null): Promise<FaceMatch> {
  return apiPost<FaceMatch>("/faces/match", { photoDataUrl });
}

/** What the Add form sends: the essentials, plus a photo if they chose one. */
export interface PersonInput {
  name: string;
  relationship: string;
  bio: string;
  photoDataUrl: string | null;
  /** Everything below is optional — the card falls back to gentle defaults. */
  lastMet?: string;
  loves?: string[];
  conversationStarter?: string;
}

/** The gradients a new face starts with — the same list the server picks from. */
const NEW_FACE_GRADIENTS = [
  "linear-gradient(135deg, #C97B3A 0%, #A3542E 100%)",
  "linear-gradient(135deg, #7C8C5E 0%, #4E5A3C 100%)",
  "linear-gradient(135deg, #D9A441 0%, #A3661D 100%)",
  "linear-gradient(135deg, #9C5B6B 0%, #6E3B49 100%)",
  "linear-gradient(135deg, #4E7A8C 0%, #2F5462 100%)",
  "linear-gradient(135deg, #8C8477 0%, #5E574C 100%)",
];

/** "Tom" → "TM", "Ellen Marsh" → "EM" — the initials the seed uses. */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  const word = parts[0];
  return (word.length > 1 ? `${word[0]}${word[word.length - 1]}` : word).toUpperCase();
}

/**
 * The same shape the server builds, so the optimistic card matches the saved
 * one the moment the response lands.
 */
function optimisticPerson(id: string, input: PersonInput, position: number): Person {
  return {
    id,
    name: input.name.trim(),
    relationship: input.relationship.trim() || "A familiar face",
    initials: initialsFor(input.name),
    gradient: NEW_FACE_GRADIENTS[position % NEW_FACE_GRADIENTS.length],
    bio:
      input.bio.trim() ||
      `You haven't written down how you know ${input.name.trim()} yet.`,
    lastMet: input.lastMet?.trim() || "Not written down yet.",
    loves: (input.loves ?? []).map((love) => love.trim()).filter(Boolean),
    conversationStarter:
      input.conversationStarter?.trim() ||
      `${input.name.trim()} has just joined your circle — ask them what they have been up to lately.`,
    photos: [],
    photoDataUrl: input.photoDataUrl,
  };
}

/** Adds a familiar face to the circle. */
export async function addPerson(input: PersonInput): Promise<Person> {
  const optimisticId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const previous = people.getState().data;
  people.setData([...previous, optimisticPerson(optimisticId, input, previous.length)]);

  try {
    const saved = await apiPost<Person>("/people", input);
    people.setData(
      people.getState().data.map((p) => (p.id === optimisticId ? saved : p))
    );
    return saved;
  } catch (error) {
    people.setData(previous);
    throw error;
  }
}

/**
 * Gives someone in the circle a photograph of their own, picked from the
 * device. Applied straight away so their card changes before the server
 * answers, and rolled back if it refuses.
 */
export async function updatePersonPhoto(
  id: string,
  photoDataUrl: string | null
): Promise<Person> {
  const previous = people.getState().data;
  people.setData(
    previous.map((p) => (p.id === id ? { ...p, photoDataUrl } : p))
  );

  try {
    const saved = await apiPatch<Person>(`/people/${id}`, { photoDataUrl });
    people.setData(people.getState().data.map((p) => (p.id === id ? saved : p)));
    return saved;
  } catch (error) {
    people.setData(previous);
    throw error;
  }
}

/**
 * Takes someone out of the circle. The card disappears straight away and
 * comes back if the server refuses.
 */
export async function deletePerson(id: string): Promise<void> {
  const previous = people.getState().data;
  people.setData(previous.filter((p) => p.id !== id));

  try {
    await apiDelete(`/people/${id}`);
  } catch (error) {
    people.setData(previous);
    throw error;
  }
}

/** Everything the card reads aloud, in the order it is spoken. */
export function cardText(p: Person): string {
  return [
    `${p.name} is ${p.relationship}.`,
    p.bio,
    `Last time you met: ${p.lastMet}.`,
    `They love: ${p.loves.join(", ")}.`,
    `Something to say: ${p.conversationStarter}`,
  ].join(" ");
}
