# SpeakUp AI

An English-speaking practice app built with Next.js, React, and TypeScript. Practice conversations with a local Ollama model, improve grammar and vocabulary, rehearse speaking, and track learning progress.

## Features

- **AI conversation practice:** guided role-play, custom scenarios, difficulty levels, goals, and optional timed sessions.
- **Speaking practice:** browser speech input and playback, plus shadowing exercises.
- **Feedback:** grammar corrections, natural phrasing suggestions, simpler explanations, and adaptive follow-up questions.
- **Vocabulary:** searchable notebook, AI-assisted definitions, flashcards, quizzes, and spaced repetition.
- **Progress:** session summaries, practice streaks, activity metrics, and micro-lessons based on recurring corrections.
- **Personalization:** learning preferences, custom practice options, speaking speed, and accessible display settings.
- **Persistence:** SQLite-backed learning data with browser localStorage as a client cache.

## Requirements

- Node.js 20.9 or newer
- npm
- [Ollama](https://ollama.com/download) for AI features

## Quick start

```bash
git clone https://github.com/uttarooque73/learn-english.git
cd learn-english
npm install
cp .env.example .env.local
ollama pull llama3.1:8b
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Configure these server-side environment variables in `.env.local` if needed:

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama service endpoint |
| `OLLAMA_MODEL` | `llama3.1:8b` | Chat model |
| `SQLITE_DATABASE_PATH` | `./data/speakup.sqlite` | SQLite database file |

Keep these variables server-side; do not prefix them with `NEXT_PUBLIC_`.

## Data and privacy notes

- The app creates its SQLite schema on first use. The database directory must be writable and stored on persistent disk.
- Existing `speakup:*` browser data is imported into SQLite once when persistence is first connected, then removed from localStorage. The client uses a synchronous in-memory cache backed by SQLite.
- There is no sign-in system. Data is scoped to an anonymous, HTTP-only browser-owner cookie and does not sync between browsers or devices.
- Serverless or ephemeral filesystems may lose the SQLite database after restart or redeployment.
- AI features require Ollama. Speech recognition and playback depend on browser/OS support and microphone permissions; browser speech recognition may use a browser-vendor service.
- Pronunciation assessment can use the optional self-hosted OpenPronounce companion service. Without it, transcript comparison is approximate. Shadowing word matching does not assess phonemes, cadence, or intonation.

## Development commands

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

GitHub Actions runs lint, type checks, unit/integration tests with coverage, a production build, and Playwright UI tests on pushes to `main` and pull requests targeting `main`.

## Architecture

```text
Browser UI
  ├── localStorage (client cache)
  └── Next.js Route Handlers (/api/*)
        ├── Ollama (streaming AI responses)
        └── SQLite (/api/persistence)
```

- **UI and server:** Next.js App Router, React, TypeScript.
- **AI:** Ollama with a configurable local model.
- **Persistence:** SQLite for sessions, summaries, vocabulary/review metadata, preferences, and custom learning options.
- **Speech:** Browser speech recognition and synthesis APIs, with text input as a fallback.


## Durable adaptive-learning worker

The adaptive planner uses a SQLite-backed job queue. Jobs have idempotency keys, bounded retries, per-attempt history, and expiring leases, so a process restart does not silently discard queued work.

1. Set `LEARNING_WORKER_SECRET` on the app server to a randomly generated secret of at least 32 characters. Set the same value only in the trusted worker/scheduler host environment; never expose it as a `NEXT_PUBLIC_*` variable.
2. Enable daily planning for a learner through `PATCH /api/learning/schedule` with their browser session and a JSON body such as `{"scheduleEnabled":true,"timezone":"Asia/Kolkata","dailyTargetMinutes":20,"goal":"Speak more confidently" }`.
3. Start the worker loop on a trusted machine with the app's URL and secret configured:

   ```bash
   export LEARNING_WORKER_URL="https://your-app.example/api/learning/worker"
   export LEARNING_WORKER_SECRET="<same server secret>"
   bash scripts/learning-worker-loop.sh
   ```

4. Schedule `bash scripts/trigger-learning-scheduler.sh` once daily using cron or your hosting scheduler. It enqueues jobs for enabled learners in their saved time zones. The worker loop claims and processes queued jobs.
5. Check worker health at `GET /api/learning/worker` and trigger the scheduler at `POST /api/learning/scheduler`. Both endpoints require `Authorization: Bearer <LEARNING_WORKER_SECRET>`.

For a local cron entry, run the scheduler at a quiet hour (for example, 00:05 server time) and keep the worker loop managed by systemd, Docker, or another process supervisor. SQLite must live on persistent storage shared by the app and worker; do not run this queue on an ephemeral or multi-host filesystem without a supported SQLite locking model.
