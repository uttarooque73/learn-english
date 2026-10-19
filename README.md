# SpeakUp AI

An English-speaking practice app built with Next.js, React, and TypeScript. Practice conversations with a local Ollama model, improve grammar and vocabulary, rehearse speaking, and track learning progress.

## Features

- **AI conversation practice:** guided role-play, custom scenarios, difficulty levels, goals, and optional timed sessions.
- **Persistent AI tutor:** conversation history is saved to SQLite per learner, restored when returning, and used as context for follow-up tutoring turns.
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
| `SQLITE_DATABASE_PATH` | `./data/speakup.sqlite` | SQLite database file |\n| `AUTH_SECRET` | — | Required in production: random secret of at least 32 characters for signing sessions |

Keep these variables server-side; do not prefix them with `NEXT_PUBLIC_`.

## Data and privacy notes

- The app creates its SQLite schema on first use. The database directory must be writable and stored on persistent disk.
- Existing `speakup:*` browser data is imported into SQLite once when persistence is first connected, then removed from localStorage. The client uses a synchronous in-memory cache backed by SQLite.
- Learners can register and sign in. Signed-in learning data is scoped to the verified account session; anonymous learning data remains scoped to an HTTP-only browser-owner cookie until an account is created.
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


## Adaptive multi-agent learning workflow

The daily-plan and submitted-attempt paths use checkpointed LangGraph workflows. They reuse the existing learning pages and domain services; not every learning feature is a separate autonomous agent.

### Daily plan graph

`POST /api/learning/plan` invokes `runMultiAgentLearningWorkflow` in `src/lib/ai/multi-agent-learning.ts`.

1. **Context loader** reads the learner profile, saved skill estimates, recurring mistakes, due vocabulary reviews, and recent attempt scores from SQLite.
2. **Diagnostic agent** prioritizes skills only from saved evidence and records its confidence and reasons.
3. **Conditional vocabulary-review agent** runs when overdue vocabulary reviews exist; otherwise the graph skips that node.
4. **Practice planner agent** asks the configured Ollama provider for a bounded plan and receives the diagnostic as a prioritization hint. Deterministic policy and validated saved evidence remain authoritative.
5. **Progress analyst** summarizes the plan and its evidence-backed priorities.

The response keeps the existing `plan` field and adds `workflow.runId`, `workflow.diagnosis`, `workflow.summary`, and `workflow.agents`.

### Attempt evaluation graph

`POST /api/learning/attempts` invokes `runMultiAgentEvaluation` in `src/lib/ai/multi-agent-evaluation.ts`. The evaluation agent delegates to the existing validated evaluator and persists the attempt/evidence; the progress analyst returns a concise score/confidence summary. Repeated submissions continue to use the attempt idempotency key.

### Persistence and operation

- LangGraph checkpoints use the SQLite checkpoint saver configured with `SQLITE_DATABASE_PATH`.
- Workflow metadata is stored in the owner-scoped `agent_runs` table. Run status and duration are recorded without storing raw answers in workflow metadata.
- Open `http://localhost:3000/learning-plan`, enter a learning goal, and generate a plan to run the planning graph. Completing a real practice item through the attempts API runs the evaluation graph.
- Existing conversation, vocabulary, grammar/micro-lesson, shadowing/pronunciation, listening, and fluency pages remain the learner-facing practice experiences. They are activity destinations, not claimed to be independent specialist agents yet.
- Tests use an injected deterministic model provider, so graph and checkpoint tests do not require a live Ollama server.

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

## Adaptive policy controls

Evidence-based skill weighting and spaced-repetition intervals are versioned and recorded with each generated plan. Learners can inspect/update their per-owner policy through `GET/PATCH /api/learning/adaptation` and pause daily scheduling through `PATCH /api/learning/schedule`. Set `LEARNING_ADAPTATION_ENABLED=false` on the server to disable evidence-based ranking globally and fall back to neutral skill weights; saved evidence remains intact.
