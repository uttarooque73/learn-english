# SpeakUp AI — English Speaking Practice

SpeakUp AI is a personal English-practice app designed to help learners speak more confidently, improve grammar, expand vocabulary, and track progress through realistic conversations with an AI tutor.

The project uses **Next.js App Router + React + TypeScript** for a single full-stack codebase. The AI service and database will be connected in later implementation phases.

## Current implementation status

### Phase 1 — Project foundation and UI
- [x] Set up the Next.js App Router and TypeScript project structure.
- [x] Create a responsive shared application shell and navigation.
- [x] Build the overview dashboard and practice, vocabulary, and progress pages.
- [x] Add responsive styling and clear empty/coming-soon states.
- [x] Document local setup and the next implementation phases.
- [ ] Connect the chat interface to Ollama (Phase 2).
- [ ] Add conversation persistence and context (later phase).
- [ ] Add grammar feedback, vocabulary saving, and progress analytics (later phases).

**Important:** Phase 1 is the UI foundation only. Chat, saved vocabulary, and progress figures are currently placeholders; no AI requests or session data are processed yet.

## Getting started

### Requirements
- Node.js 20.9 or newer
- npm
- Ollama will be needed for Phase 2, but is not required to run the Phase 1 UI.

### Install and run

```bash
git clone https://github.com/uttarooque73/learn-english.git
cd learn-english
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available commands

```bash
npm run dev       # Start the local development server
npm run build     # Create a production build
npm run start     # Run the production server after building
npm run typecheck # Run TypeScript checks
```

## Architecture

```text
Browser (Next.js UI)
        |
        v
Next.js Route Handlers (/api/*)
        |
        +------> Ollama (local LLM service)
        |
        +------> SQLite database (through Prisma)
```

- **Full-stack framework:** Next.js App Router, React, TypeScript.
- **Server API:** Next.js Route Handlers; no separate Express server is planned for the MVP.
- **AI runtime:** Ollama with a configurable local chat model (Phase 2).
- **Database and ORM:** SQLite + Prisma (planned for the persistence phase).
- **Speech:** Browser speech recognition and speech synthesis APIs, with a text-only fallback (planned).
- **Styling:** Responsive CSS with no UI component library required.

## Feature roadmap

### 1. AI Conversation Practice
- [ ] Chat with an AI tutor on everyday and professional topics.
- [ ] Choose a topic before starting a session.
- [ ] Select a difficulty level: Beginner, Intermediate, or Advanced.
- [ ] Set a conversation goal and optional session duration.
- [ ] Ask follow-up questions and request simpler explanations.
- [ ] Continue a previous conversation from saved history.

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
- [ ] Save conversation history with date, topic, and duration.
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
- [ ] Use Ollama as the local LLM provider.
- [ ] Make the model name and Ollama endpoint configurable.
- [ ] Keep model prompts and response handling on the server.
- [ ] Store sessions locally for the MVP, with a path to a database later.
- [ ] Handle Ollama unavailable, timeout, and malformed-response errors.
- [ ] Add input validation and safe error messages.
- [ ] Document setup, configuration, and troubleshooting.
- [ ] Clearly explain that browser speech services may process audio differently depending on the browser; local LLM use does not automatically make voice processing fully offline.

## Development principles

- Prioritize a responsive, uncluttered interface.
- Keep conversation flow natural; avoid correcting every sentence unless the learner asks for it.
- Make feedback specific and actionable.
- Do not expose secrets or internal server configuration to the browser.
- Treat voice support as an optional enhancement, not a requirement for text practice.
- Deliver the MVP before implementing advanced analytics and gamification.
