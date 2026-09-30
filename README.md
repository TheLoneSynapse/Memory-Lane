# Memory Lane

**Memory Lane** is a gentle photo and memory companion designed to help people hold on to the people, moments, and plans that matter most — and to talk about them out loud.

A family member sets it up. The person using it just taps, listens, and speaks.

---

## What it does

| Screen | What you can do there |
| --- | --- |
| **Home** | See today's memory, keep short written notes, and read back the moments that matter |
| **Faces** | A circle of the people in your life — tap one to see their name, relationship, and photos |
| **Camera** | Take a photo and save it as a memory, with a note |
| **Memories** | Browse every saved photo and note |
| **Stories** | Hear the memories told as short stories |
| **Today** | See today's plan — appointments, visits, reminders — and what is coming up |

### Voice companion

A button in the bottom-right corner of every screen opens a voice call. The companion:

- Tells you what day and time it is
- Reads today's plan and what is coming up
- Looks someone up and shows their face on screen while it talks about them
- Searches your saved memories and reads them back
- Keeps a note you dictate, visible in the library before the call ends
- Corrects something already saved — the year, the name, the wording
- Adds a reminder to today's plan
- Takes a plan off — today's, or one on any coming day
- Moves a plan to a different time or day
- Tells you what a word means
- Searches the web for a fact

> **Full list of example phrases and conversation flows: [VOICE-AGENT.md](VOICE-AGENT.md)**

Nothing is ever deleted silently. When a plan is taken off, it is only hidden — the record of it stays, and a family member can read exactly what changed and why at `GET /api/schedule/changes`.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Tailwind CSS 4, Vite 7 |
| Backend | Node.js, Express 5 |
| Voice | AssemblyAI Voice Agent API (WebSocket) |
| Storage (default) | A single local JSON file — no database needed |
| Storage (multi-user) | Supabase (Postgres + Storage) — optional |

---

## Requirements

- **Node.js** 18 or later
- An **AssemblyAI API key** if you want the voice companion ([get one free](https://www.assemblyai.com/dashboard/api-keys))
- A **Supabase project** only if you want per-user accounts and cloud storage (optional)

---

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/TheLoneSynapse/Memory-Lane.git
cd Memory-Lane
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your environment file

```bash
cp .env.example .env
```

Open `.env` and fill in what you need (see [Environment variables](#environment-variables) below).

### 4. Start the app

Two terminals, both from the project folder:

```bash
# Terminal 1 — API server on http://localhost:4000
npm run server

# Terminal 2 — Frontend on http://localhost:5173
npm run dev
```

Open **http://localhost:5173** in your browser. That is it — the app runs with demo content already loaded.

> Vite proxies every `/api` request to the Express server, so the browser only ever talks to one address.

---

## Running in production (single process)

Build the frontend once and let Express serve everything:

```bash
npm start
# open http://localhost:4000
```

Or in two steps:

```bash
npm run build   # builds the frontend into dist/
npm run server  # serves the API and the built frontend together
```

---

## Environment variables

Copy `.env.example` to `.env`. Only `ASSEMBLYAI_API_KEY` is needed for the voice companion. Everything else is optional.

### Voice assistant

```env
# Required for the voice companion
ASSEMBLYAI_API_KEY=your_key_here
```

Get a free key at [assemblyai.com/dashboard](https://www.assemblyai.com/dashboard/api-keys).

### Stored agent (optional — for phone calls and deployed apps)

By default the companion is configured inline for each browser session — no public URL needed, works on `localhost`.

To publish it as a persistent AssemblyAI agent that can also be called by phone:

```env
MEMORY_LANE_BASE_URL=https://your-public-url.example.com
# AGENT_ID=                  ← filled in automatically after agent:publish
```

```bash
MEMORY_LANE_BASE_URL=https://your-app.example.com npm run agent:publish
# copy the agent ID it prints, paste it as AGENT_ID= in .env, then restart the server
```

### Search engines (optional)

With no keys set, the companion already works: definitions come from Wiktionary, general searches from Wikipedia.

```env
# For real Google results:
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_CSE_ID=

# Or Brave Search:
BRAVE_SEARCH_API_KEY=
```

### Supabase — per-user storage (optional)

By default everything is stored in `server/data/db.json` (one shared local store, no login). Adding Supabase turns the same app into a proper multi-user service where each person has their own account and private memories.

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# SUPABASE_PHOTOS_BUCKET=photos   ← created automatically, change only if needed
```

**How to set it up (about 10 minutes, no credit card):**

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Dashboard → SQL Editor**, run the contents of `server/supabase-schema.sql`.
3. In **Authentication → Providers → Email**, turn **Confirm email** off — the app creates accounts itself without needing an email service.
4. In **Settings → API**, copy your project URL and service role key into `.env`.
5. Run `npm run server`. The boot log will print `login : on` and the photos bucket is created automatically.

| | File mode (default) | Supabase mode |
| --- | --- | --- |
| Who | One shared store | One private store per signed-in person |
| Login | None | Email + password, 30-day session |
| Photos | Stored inside the JSON | Stored in Supabase Storage |
| Survives a redeploy | Only with a persistent disk | Yes — data lives in Supabase |

---

## NPM scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server (with `/api` proxy) |
| `npm run server` | Start the Express API server |
| `npm run server:watch` | Start the API and auto-restart on file changes |
| `npm run build` | Build the frontend into `dist/` |
| `npm start` | Build the frontend and start the server together |
| `npm run preview` | Preview the production build locally |
| `npm run agent:publish` | Publish the voice companion as a stored AssemblyAI agent |

---

## Project structure

```
/
├── src/                        Frontend (React + TypeScript)
│   ├── components/             All UI components
│   │   ├── VoiceAgent.tsx      The voice call panel and microphone button
│   │   ├── VoiceWave.tsx       Live audio waveform during calls
│   │   ├── WhoIsThis.tsx       Person card opened by the companion
│   │   ├── CameraView.tsx      Camera capture screen
│   │   ├── PhotoGallery.tsx    Photo gallery view
│   │   └── ...
│   ├── data/                   API stores and voice agent logic
│   │   ├── api.ts              Every network call, in one place
│   │   ├── voiceAgent.ts       WebSocket session, audio capture and playback
│   │   ├── agentTools.ts       Tool handlers called by the voice companion
│   │   ├── agentFocus.ts       "Move to this screen" signal from the companion
│   │   ├── memoryStore.ts      Saved memories store
│   │   └── resource.ts         Shared fetch-once / optimistic-update pattern
│   └── App.tsx                 Screen routing
│
└── server/                     Backend (Node.js + Express)
    ├── index.js                Starts the server (default port 4000)
    ├── app.js                  Middleware, route mounting, error handling
    ├── store.js                Read/write the JSON store; merges schedule and memories
    ├── seed.js                 Demo content loaded on first run
    ├── http.js                 HttpError, asyncHandler, input helpers
    ├── auth.js                 Login / logout / session guard (Supabase mode)
    ├── supabase.js             Supabase client (documents, photos, sessions)
    ├── photos.js               Moves photos out of JSON into Supabase Storage
    ├── loadEnv.js              Reads .env for the voice assistant credentials
    ├── supabase-schema.sql     Run this once in Supabase to create the tables
    ├── data/db.json            The local store (created on first run, git-ignored)
    ├── agent/
    │   ├── persona.js          The companion's personality, prompt, greeting and voice
    │   ├── tools.js            The 13 tools the companion can call
    │   └── publish.js          `npm run agent:publish` — store the companion on AssemblyAI
    └── routes/
        ├── agent.js            Voice session endpoints + all companion tool endpoints
        ├── home.js             Home moments
        ├── people.js           People / circle of faces
        ├── faces.js            Face matching
        ├── memories.js         Saved photo memories
        ├── stories.js          Stories
        ├── schedule.js         Today's plan (schedule + change log)
        └── events.js           Default events and upcoming list
```

---

## API reference

### App endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | Uptime check |
| GET | `/api/home` | Memory of the day + written moments |
| POST | `/api/home/moments` | Add a written moment |
| PATCH | `/api/home/moments/:id` | Edit a written moment |
| DELETE | `/api/home/moments/:id` | Remove a written moment |
| POST | `/api/home/reset` | Restore the demo content |
| GET | `/api/people` | All people in the circle |
| POST | `/api/people` | Add a person |
| GET | `/api/people/random` | A random person from the circle |
| GET | `/api/people/by-name/:name` | Find a person by name |
| GET | `/api/people/:id` | One person's card |
| PATCH | `/api/people/:id` | Update a person (e.g. add a photo) |
| POST | `/api/faces/match` | Suggest who is in a photograph |
| GET | `/api/memories` | All saved memories (filterable by destination) |
| GET | `/api/memories/:id` | One memory |
| POST | `/api/memories` | Save a new memory |
| PATCH | `/api/memories/:id` | Edit a saved memory |
| DELETE | `/api/memories/:id` | Delete a memory |
| GET | `/api/stories` | All stories |
| GET | `/api/stories/:id` | One story |
| GET | `/api/schedule` | Today's plan (defaults merged with edits) |
| POST | `/api/schedule/events` | Add an event to the plan |
| PATCH | `/api/schedule/events/:id` | Edit an event |
| DELETE | `/api/schedule/events/:id` | Remove an event |
| GET | `/api/events/today` | The untouched default events for today |
| GET | `/api/events/upcoming` | What is coming up |
| GET | `/api/schedule/changes` | Log of every move or cancellation |

### Voice companion endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/agent/config` | How to open a session (inline or stored agent) |
| POST | `/api/agent/token` | Issue a single-use 60-second session token |
| GET | `/api/agent/now` | Current day, date and time of day |
| GET | `/api/agent/context` | Today's plan, coming up, memory of the day, people |
| GET | `/api/agent/person` | Look up one person by name or relationship |
| GET | `/api/agent/memories` | Search the memory library |
| POST | `/api/agent/remember` | Save a new note |
| POST | `/api/agent/edit-memory` | Correct a saved memory (year, name, or note) |
| POST | `/api/agent/today` | Add a reminder to today |
| POST | `/api/agent/cancel` | Take a plan off, on any day, keeping the record |
| POST | `/api/agent/move` | Move a plan to a different time or day |
| GET | `/api/agent/define` | Look up what a word means |
| GET | `/api/agent/search` | Search the web for a fact |

All errors are JSON: `{ "error": { "status": 404, "message": "…" } }`

---

## How the voice companion works

### Audio

The microphone is streamed as 24 kHz PCM16 audio over a WebSocket to AssemblyAI's Voice Agent API. The reply is played back through a ring buffer so that interrupting the companion stops it mid-word. Both capture and playback are resampled inside an AudioWorklet, which keeps browser echo cancellation working on Firefox and Safari.

### Turn detection

The API decides when a turn has ended from the meaning of what was said — not a fixed silence timer. The companion starts answering as soon as the question is plainly finished, while a hesitant speaker still gets room to pause.

### The conversation moves the screen

Because the tools run in the browser, a spoken question can also change what is on screen. Saying "who's my daughter?" opens Ellen's face card while the companion talks about her. Saying "go to memories" takes you there while the call carries on. This signal flows through `src/data/agentFocus.ts`: the tool writes it, `App.tsx` reads it and moves the screen, `WhoIsThis` opens the card and clears it.

### Nothing is ever deleted

When the companion cancels a plan it only hides it — the plan stays in the data, and the change is written to the `schedule.changes` log with a timestamp, who made the change, and why. A family member can read the full history at `GET /api/schedule/changes`.

```json
{
  "by": "companion",
  "action": "cancelled",
  "at": "2026-09-27T19:41:02.114Z",
  "headline": "Ruby is coming for lunch",
  "before": { "time": "12:30", "headline": "Ruby is coming for lunch", "description": "…" },
  "after": null,
  "reason": "she said Ruby is away this week"
}
```

---

## Resetting the demo

```bash
curl -X POST http://localhost:4000/api/home/reset
```

Or press the reset button in the app's settings. This restores all the seeded demo content without restarting the server.

---

## Troubleshooting

**The voice button does nothing**
→ Check that `ASSEMBLYAI_API_KEY` is set in `.env` and the server has been restarted.

**"Cannot connect to API"**
→ Make sure both `npm run server` (port 4000) and `npm run dev` (port 5173) are running.

**Supabase login fails**
→ Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct, and that you ran `server/supabase-schema.sql` in the SQL editor.

**Photos are not saving in Supabase mode**
→ The `photos` bucket is created automatically on first boot. If it is missing, check the boot log for errors and re-run the schema SQL.

**The companion says it cannot find a plan**
→ Plans are matched by the words you use. If "chess" does not find it, try saying the day too: "cancel the chess on Wednesday".
