/**
 * "Who is this?" — the friendly face matcher.
 *
 * The demo has no face-recognition model, so a match is suggested from the
 * circle of people. The endpoint exists so a real matcher can be dropped in
 * later (the app only ever calls POST /api/faces/match).
 */
import { Router } from "express";
import { HttpError, optionalImageDataUrl, pickRandom } from "../http.js";
import { readDb } from "../store.js";

const router = Router();

/**
 * POST /api/faces/match
 * Body: { photoDataUrl?: string }
 * Responds with the suggested person, a confidence score and the moment the
 * look was taken.
 */
router.post("/match", (req, res) => {
  const { people } = readDb();
  if (!people.length) throw new HttpError(404, "No familiar faces have been added yet.");

  const body = req.body ?? {};
  const photoDataUrl = optionalImageDataUrl(body.photoDataUrl);

  const person = pickRandom(people);
  res.json({
    person,
    confidence: Number((0.62 + Math.random() * 0.32).toFixed(2)),
    considered: people.length,
    lookedAt: photoDataUrl ? "photograph" : "the circle of faces",
    matchedAt: new Date().toISOString(),
  });
});

export default router;
