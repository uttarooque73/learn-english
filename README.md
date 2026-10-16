# SpeakUp AI — English Speaking Practice

SpeakUp AI is a personal English-practice app designed to help learners speak more confidently, improve grammar, expand vocabulary, and track progress through realistic conversations with an AI tutor.

The project uses **Next.js App Router + React + TypeScript** for a single full-stack codebase. A server-side streaming API connects the Practice Room to local Ollama; browser speech features and local learning storage support practice, feedback, vocabulary, and progress.

## Current implementation status

### Phase 1 — Project foundation and UI
- [x] Set up the Next.js App Router and TypeScript project structure.
- [x] Create a responsive shared application shell and navigation.
- [x] Build the overview dashboard and practice, vocabulary, and progress pages.
- [x] Add responsive styling and clear empty/coming-soon states.
- [ ] Ensure the entire application is mobile-first and fully usable on phones, including navigation, practice chat, forms, cards, and dashboards.
- [x] Document local setup and the implementation roadmap.
- [x] Connect the Practice Room to Ollama through a streaming Next.js Route Handler.
- [x] Add scenario selection, streaming chat UI, input validation, and actionable connection errors.
- [x] Add unit and integration tests for chat behavior and API validation.
- [x] Add browser speech-to-text input and text-to-speech playback where supported.
- [x] Add Ollama-powered grammar feedback, natural phrasing, learning tips, and suggested vocabulary.
- [x] Save suggested phrases and track practice summaries locally in the browser.
- [x] Show real local practice metrics on the overview and progress pages.
### Phase 2 — Saved conversations and improved transcript practice
- [x] Persist complete conversation transcripts in browser local storage.
- [x] Restore a saved conversation from the Practice Room after refresh.
- [x] Keep recent session history bounded to avoid unbounded local storage growth.
- [x] Compare recognized words in sequence and show likely missing or extra/substituted words.
- [x] Add tests for transcript similarity scoring.
- [ ] Add true phoneme-level pronunciation assessment with a dedicated speech model.

**Current limitations:** Voice input depends on browser support (for example, recent Chrome or Edge) and microphone permission. Pronunciation practice uses the browser's speech transcript and an ordered word-edit comparison; this gives more actionable transcript feedback but is still not an acoustic or phoneme-level pronunciation score. Conversation transcripts, vocabulary, and practice summaries use browser local storage, remain on this browser profile, and are not synced across devices. Older saved sessions that only contain learner messages remain restorable, but assistant replies cannot be reconstructed for those sessions.

## Getting started

### Requirements
- Node.js 20.9 or newer (Node.js 22 is used in CI)
- npm
- Ollama is required to use AI chat, but not to run the UI, unit tests, or integration tests.

### Install and run

For an existing checkout, update the code, install dependencies, ensure Ollama is available, and start the app with one command:

```bash
git pull --ff-only && bash scripts/update-and-run.sh
```

The script discards tracked local changes with `git reset --hard` and removes untracked files/directories with `git clean -fd` before pulling. **This is destructive:** do not run it if you need any uncommitted or untracked work. Git-ignored files such as `.env.local` and `node_modules` are preserved. It keeps your existing `.env.local` custom settings, upgrades the old default model setting from `qwen3:4b` to `llama3.1:8b`, and downloads the configured model only if it is missing.

For a fresh install:

```bash
git clone https://github.com/uttarooque73/learn-english.git
cd learn-english
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Configure Ollama for chat

1. Install and start [Ollama](https://ollama.com/download).
2. Ensure the configured model is installed. The default is `llama3.1:8b`:

   ```bash
   ollama pull llama3.1:8b
   ```

3. Create your local environment file and adjust it if needed:

   ```bash
   cp .env.example .env.local
   ```

4. Restart the Next.js development server after changing environment variables.

The server reads `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`) and `OLLAMA_MODEL` (default `llama3.1:8b`). These must remain server-only variables; do not rename them with the `NEXT_PUBLIC_` prefix. The browser sends messages only to `/api/chat`.

## Quality checks

Run these checks before considering a change complete:

```bash
npm run lint          # ESLint / Next.js rules
npm run typecheck     # TypeScript checks
npm test              # Unit and integration tests
npm run test:coverage # Tests plus coverage thresholds
npm run build         # Production build
npm run test:e2e      # Playwright browser/UI tests
```

For interactive test development, run `npm run test:watch`.

### Responsive UI and mobile support

**Requirement:** SpeakUp AI must be comfortable to use on a phone as well as on a desktop. Responsive behavior is a product requirement, not an optional polish task.

Acceptance criteria:
- Use a mobile-first layout and responsive CSS breakpoints; verify narrow screens around 320–390 CSS pixels as well as tablet and desktop widths.
- Include the correct viewport metadata and prevent horizontal page overflow.
- Make navigation usable on small screens (for example, a compact menu or mobile navigation pattern).
- Keep chat messages readable and the message composer usable when the on-screen keyboard is open; controls must not be clipped or require horizontal scrolling.
- Ensure buttons, links, inputs, and scenario cards have comfortable touch targets and spacing.
- Scale headings, spacing, cards, and page layouts for small screens while preserving readable contrast and text sizes.
- Respect safe-area insets where needed and avoid fixed elements covering important content.
- Add or update Playwright UI tests for key mobile flows, including navigation and sending a chat message. Run the tests at a phone-sized viewport, not only desktop.
- Before marking responsive work complete, manually verify the home, practice, vocabulary, and progress pages on a phone or browser device emulation.

### Testing strategy
- **Unit tests:** Vitest + React Testing Library. Test individual components, helpers, and isolated behavior.
- **Integration tests:** Vitest. Test how app components and application modules work together; add API/route-handler and persistence integration tests when those features are implemented.
- **UI / end-to-end tests:** Playwright. Test user-visible flows in a real browser, including navigation and critical practice workflows.
- **Coverage:** Coverage is collected with V8. Initial global thresholds are deliberately modest (30% statements/lines and 20% branches/functions) while the project is young. Increase thresholds as meaningful tests are added; do not lower them just to make a failing build pass.
- **Lint and types:** ESLint and TypeScript checks must pass.
- **Build:** A production build must succeed.

### Continuous integration
GitHub Actions runs on every push to `main` and every pull request targeting `main`. It runs linting, type-checking, unit/integration tests with coverage thresholds, the production build, and Playwright browser tests.

**Definition of done for each phase**
1. Implement the complete phase scope.
2. Add or update unit, integration, and UI tests for the behavior introduced; if a test category is not applicable, document why.
3. For any UI change, verify responsive behavior on mobile and desktop and add mobile-viewport UI coverage where appropriate.
4. Run all applicable quality checks locally and fix failures.
5. Never claim a check passed unless it was actually run and passed.
6. Update this README when setup, architecture, commands, or behavior changes.
7. Commit the completed phase once, with a descriptive commit message. Do not split a single phase into a series of partial feature commits.

CI runs on push/PR, not at the moment of a local commit. Do not treat a commit as verified until the relevant CI checks have completed successfully. Configure branch protection in GitHub repository settings if you want GitHub to block merging when required checks fail.

## Available commands

```bash
npm run dev       # Start local development server
npm run build     # Create a production build
npm run start     # Run the production server after building
npm run typecheck # Run TypeScript checks
npm run lint      # Run ESLint
npm test          # Run unit and integration tests
npm run test:coverage
npm run test:e2e  # Run Playwright browser tests
```

## Architecture

```text
Browser (Next.js UI)
        |
        v
Next.js Route Handlers (/api/*)
        |
        +------> /api/chat -> Ollama (local LLM service)
        |
        +------> Browser localStorage (sessions, vocabulary, progress)
```

- **Full-stack framework:** Next.js App Router, React, TypeScript.
- **Server API:** Next.js Route Handlers; no separate Express server is planned for the MVP.
- **AI runtime:** Ollama with a configurable local chat model. The API streams response text from Ollama to the browser.
- **Learning data persistence:** Browser `localStorage` for conversation transcripts, vocabulary, and practice summaries; data is device/browser-profile specific and is not synced.
- **Speech:** Browser speech recognition and speech synthesis APIs, with a text-only fallback (planned).
- **Styling:** Responsive CSS with no UI component library required.

## Feature roadmap

### 1. AI Conversation Practice
- [ ] Chat with an AI tutor on everyday and professional topics.
- [ ] Choose a topic before starting a session.
- [ ] Select a difficulty level: Beginner, Intermediate, or Advanced.
- [ ] Set a conversation goal and optional session duration.
- [ ] Ask follow-up questions and request simpler explanations.
- [x] Continue a previous conversation from saved local history.

### 2. Voice Practice
- [ ] Speech-to-text input using browser speech recognition where supported.
- [ ] Text-to-speech playback for AI responses.
- [ ] Start, pause, and end a voice-practice session.
- [ ] Show a live transcript of the conversation.
- [ ] Provide a text-input fallback when browser speech features are unavailable.
- [ ] Allow users to replay AI responses and practice saying them aloud.

### 3. English Feedback and Corrections
- [ ] Identify grammar mistakes in the learner's messages.
- [ ] Show the original sentence and a corrected version.
- [ ] Suggest a more natural, fluent way to express the same idea.
- [ ] Explain corrections in simple English.
- [ ] Distinguish important errors from optional style improvements.
- [ ] Offer a short practice prompt based on a correction.
- [ ] Let the learner choose immediate feedback or a summary at the end.

### 4. Vocabulary Builder
- [ ] Highlight useful words and phrases from conversations.
- [ ] Explain meanings in context with example sentences.
- [ ] Save words and phrases to a personal vocabulary notebook.
- [ ] Mark vocabulary as learning, familiar, or mastered.
- [ ] Review saved vocabulary with flashcards and short quizzes.
- [ ] Practice collocations, phrasal verbs, and common expressions.

### 5. Guided Scenarios and Role-play
- [ ] Practice job interviews and workplace discussions.
- [ ] Role-play meetings, presentations, and stand-up updates.
- [ ] Practice travel, shopping, restaurants, and everyday conversations.
- [ ] Practice phone calls and asking for help.
- [ ] Practice explaining technical concepts and discussing software development.
- [ ] Support free conversation without a predefined scenario.

### 6. Fluency and Confidence Exercises
- [ ] Quick-response challenge with a limited response time.
- [ ] Daily speaking prompt.
- [ ] One-minute talk on a selected topic.
- [ ] Follow-up questions to encourage longer answers.
- [ ] Filler-word awareness and concise-answer suggestions.
- [ ] Encouraging, non-judgmental feedback focused on improvement.

### 7. Session Summary
- [ ] Summarize the topic and key points discussed.
- [ ] Show useful corrections and natural phrasing suggestions.
- [ ] List new vocabulary learned during the session.
- [ ] Identify strengths and the top areas to improve next.
- [ ] Generate a short follow-up exercise based on the session.

### 8. Progress Tracking
- [x] Save conversation history with date, topic, duration, and transcript.
- [ ] Track practice frequency, session count, and speaking time.
- [ ] Track recurring grammar mistakes and improvement over time.
- [ ] Track vocabulary learned and reviewed.
- [ ] Show weekly and monthly progress summaries.
- [ ] Maintain a practice streak and optional daily goal.
- [ ] Use transparent indicators rather than claiming a precise English-proficiency score without a validated assessment.

### 9. Personalization and Accessibility
- [ ] Configure English level, goals, and preferred topics.
- [ ] Choose feedback style: gentle, balanced, or detailed.
- [ ] Configure AI response speed and voice where supported.
- [ ] Support keyboard-only interaction and readable contrast.
- [ ] Provide clear microphone-permission and browser-compatibility messages.
- [ ] Allow users to delete individual sessions or all saved practice data.

### 10. Technical and Privacy Features
- [x] Use Ollama as the local LLM provider.
- [x] Make the model name and Ollama endpoint configurable.
- [x] Keep model prompts and response handling on the server.
- [x] Store full session transcripts locally for the MVP, with a path to a database later.
- [x] Handle Ollama unavailable, timeout, and unsuccessful upstream responses.
- [x] Add input validation and safe error messages.
- [x] Document setup, configuration, and troubleshooting.
- [ ] Clearly explain that browser speech services may process audio differently depending on the browser; local LLM use does not automatically make voice processing fully offline.

## Development principles

- Prioritize a responsive, uncluttered interface.
- Keep conversation flow natural; avoid correcting every sentence unless the learner asks for it.
- Make feedback specific and actionable.
- Do not expose secrets or internal server configuration to the browser.
- Treat voice support as an optional enhancement, not a requirement for text practice.
- Deliver the MVP before implementing advanced analytics and gamification.
