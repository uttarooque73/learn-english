# SpeakUp AI

<p align="center">
  <strong>Practice English with an AI tutor that adapts to you.</strong><br />
  Conversations, grammar feedback, vocabulary revision, speaking practice, and progress tracking in one learning workspace.
</p>

<p align="center">
  <a href="https://github.com/uttarooque73/learn-english/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-green.svg" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript" />
  <img alt="AI powered by Ollama" src="https://img.shields.io/badge/AI-Ollama-222222" />
</p>

---

## ✨ What is SpeakUp AI?

SpeakUp AI is an English-learning web app built with **Next.js, React, and TypeScript**. It combines AI-guided practice with saved learning history, adaptive recommendations, and progress insights—so learners can practise consistently and focus on areas that need attention.

## 🚀 Features

| Area | What you can do |
| --- | --- |
| 🗣️ **AI conversation tutor** | Practise guided conversations, role-play real-life scenarios, set goals, adjust difficulty, and use timed sessions. |
| 📝 **Grammar & writing feedback** | Understand mistakes, see more natural phrasing, get simpler explanations, and answer adaptive follow-up questions. |
| 🎧 **Speaking & listening** | Use browser speech input and playback, practise shadowing, and work with text when speech features are unavailable. |
| 📚 **Vocabulary builder** | Maintain a searchable vocabulary notebook, review flashcards, take quizzes, and use spaced repetition. |
| 📈 **Learning insights** | Review skill trends, an eight-week score history, period comparisons, and recurring mistakes. |
| 🎯 **Adaptive learning plans** | Generate plans using saved skill estimates, recent attempts, recurring mistakes, and vocabulary reviews due. |
| 🔁 **Persistent learning history** | Save conversations, summaries, practice attempts, preferences, and vocabulary data in SQLite. |
| 🏆 **Progress & motivation** | Track practice streaks, activity, session summaries, and micro-lessons based on recurring corrections. |
| 🔐 **Account & data portability** | Use account-scoped learning data and download an owner-scoped JSON export of learning records. Authentication secrets are excluded from exports. |

## 🧰 Tech stack

- **Web app:** Next.js App Router, React, TypeScript
- **AI provider:** Ollama with a configurable model
- **Agent workflows:** LangGraph with SQLite-backed checkpoints
- **Persistence:** SQLite, with browser `localStorage` used as a client cache
- **Speech:** Browser speech recognition and speech synthesis APIs
- **Testing:** Vitest, Testing Library, and Playwright
- **Quality checks:** ESLint, TypeScript checks, production build, and GitHub Actions

## ⚡ Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) **20.9 or newer**
- npm
- [Ollama](https://ollama.com/download) for AI features

### 1. Clone and install

```bash
git clone https://github.com/uttarooque73/learn-english.git
cd learn-english
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Review the values in `.env.local`. The app uses these server-side variables when configured:

| Variable | Default | Description |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama service endpoint |
| `OLLAMA_MODEL` | `llama3.1:8b` | Chat model to use |
| `SQLITE_DATABASE_PATH` | `./data/speakup.sqlite` | SQLite database path |
| `AUTH_SECRET` | — | In production, a random secret of at least 32 characters for signing sessions |

Keep secrets server-side. **Do not** prefix secret environment variables with `NEXT_PUBLIC_`.

### 3. Start Ollama and the app

```bash
ollama pull llama3.1:8b
npm run dev
```

Open **http://localhost:3000** in your browser.

## 🔑 Local development account

The development command seeds a local account if one does not already exist. Visit **http://localhost:3000/login** and use:

- **Username:** `umarkhan`
- **Password:** `umarkhan`

The seeder preserves an existing account and does not reset its password on restart. The username maps to the local-only email `umarkhan@speakup.local`.

To customize the seeded account, set `DEV_USER_EMAIL`, `DEV_USER_PASSWORD`, and `DEV_USER_NAME` in `.env.local`, or run:

```bash
npm run seed:dev-user
```

> **Security note:** This account is for local development only. The seed script refuses to run when `NODE_ENV=production`. Never use the sample credentials in a deployed environment.

## 🧠 How the learning workflows work

SpeakUp AI uses checkpointed LangGraph workflows for daily learning plans and submitted practice attempts. These workflows coordinate existing domain services; not every learner-facing feature is a separate autonomous agent.

### Daily learning plan

`POST /api/learning/plan` invokes `runMultiAgentLearningWorkflow` in `src/lib/ai/multi-agent-learning.ts`.

1. **Context loader** gathers the learner profile, saved skill estimates, recurring mistakes, due vocabulary reviews, and recent attempt scores.
2. **Diagnostic agent** prioritizes skills based on saved evidence and records its confidence and reasons.
3. **Vocabulary-review agent** runs when vocabulary reviews are overdue; otherwise, that step is skipped.
4. **Practice planner** uses the configured Ollama provider to propose a bounded plan, guided by the diagnostic.
5. **Progress analyst** summarizes the plan and its evidence-based priorities.

The response retains the existing `plan` field and adds `workflow.runId`, `workflow.diagnosis`, `workflow.summary`, and `workflow.agents`.

### Practice-attempt evaluation

`POST /api/learning/attempts` invokes `runMultiAgentEvaluation` in `src/lib/ai/multi-agent-evaluation.ts`. The workflow uses the existing validated evaluator, persists the attempt and evidence, and returns a concise score/confidence summary. Attempt idempotency keys protect against repeated submissions.

### Try the workflow

1. Start the app and sign in.
2. Open **http://localhost:3000/learning-plan**.
3. Enter a learning goal and generate a plan.
4. Complete a practice item to exercise the attempt-evaluation workflow.

Tests use an injected deterministic model provider, so workflow and checkpoint tests do not require a running Ollama server.

## ⏱️ Optional: durable adaptive-learning worker

The adaptive planner can use a SQLite-backed job queue with idempotency keys, bounded retries, attempt history, and expiring leases.

1. Set `LEARNING_WORKER_SECRET` on the app server to a random secret of at least 32 characters. Keep it out of client-side variables.
2. Enable a learner's daily plan through `PATCH /api/learning/schedule`, using their authenticated browser session and a JSON body such as:

   ```json
   {
     "scheduleEnabled": true,
     "timezone": "Asia/Kolkata",
     "dailyTargetMinutes": 20,
     "goal": "Speak more confidently"
   }
   ```

3. Configure the trusted worker host:

   ```bash
   export LEARNING_WORKER_URL="https://your-app.example/api/learning/worker"
   export LEARNING_WORKER_SECRET="<same server secret>"
   bash scripts/learning-worker-loop.sh
   ```

4. Schedule `bash scripts/trigger-learning-scheduler.sh` daily using cron or your hosting scheduler.
5. Check worker health with `GET /api/learning/worker` or trigger scheduling with `POST /api/learning/scheduler`. Both endpoints require `Authorization: Bearer <LEARNING_WORKER_SECRET>`.

For production, keep the worker process supervised and store SQLite on persistent storage shared by the app and worker. Do not use this queue on ephemeral or multi-host storage unless its SQLite locking behavior is supported.

## ⚙️ Adaptive policy controls

Evidence-based skill weights and spaced-repetition intervals are versioned and recorded with each generated plan.

- Use `GET/PATCH /api/learning/adaptation` to inspect or update an owner's policy.
- Use `PATCH /api/learning/schedule` to pause daily scheduling.
- Set `LEARNING_ADAPTATION_ENABLED=false` on the server to disable evidence-based ranking globally. Saved evidence remains intact.

## 🛠️ Development

### Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run unit and integration tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run build` | Create a production build |

GitHub Actions is configured to run linting, type checks, tests with coverage, a production build, and Playwright UI tests on pushes to `main` and pull requests targeting `main`.

### Architecture at a glance

```text
Browser
  ├── React / Next.js UI
  ├── localStorage (client cache)
  └── Next.js Route Handlers (/api/*)
        ├── Ollama (AI responses)
        ├── SQLite (learning data and workflow checkpoints)
        └── Adaptive-learning job queue
```

## 🔒 Data, privacy & deployment notes

- SQLite schema is created on first use. Its directory must be writable and stored on persistent storage.
- Existing `speakup:*` browser data is imported into SQLite once when persistence is first connected, then removed from `localStorage`.
- Signed-in learning data is scoped to the verified account session. Anonymous learning data is scoped to an HTTP-only browser-owner cookie until an account is created.
- Serverless or ephemeral filesystems may lose the SQLite database after restart or redeployment.
- Speech recognition and playback depend on browser/OS support and microphone permissions. Browser speech recognition may use a browser-vendor service.
- The optional self-hosted OpenPronounce companion service can support pronunciation assessment. Without it, transcript comparison is approximate; shadowing word matching does not assess phonemes, cadence, or intonation.
- Do not commit secrets, real learner data, local SQLite databases, or production credentials.

## 🤝 Contributing

Contributions, bug reports, and thoughtful suggestions are welcome.

1. Check existing issues and pull requests before starting substantial work.
2. Create a focused branch for your change.
3. Add or update tests when behavior changes.
4. Run the relevant checks before opening a pull request.
5. Never include secrets or real user data in commits.

By submitting a contribution, you agree that it may be distributed under this project's MIT License unless a different arrangement is agreed to in writing.

## 📄 License

Released under the **MIT License**. You may use, modify, distribute, and use this project commercially, subject to the license conditions. Include the copyright and permission notice with copies or substantial portions of the software.

Copyright © 2026 Umarkhan. See [`LICENSE`](./LICENSE) for the full license text.

Third-party packages, AI models, and external services remain subject to their own licenses and terms. The repository's MIT License does not change those terms.
