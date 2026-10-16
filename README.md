# SpeakUp AI — English Speaking Practice

SpeakUp AI is a personal English-practice app designed to help learners speak more confidently, improve grammar, expand vocabulary, and track progress through realistic conversations with an AI tutor.

## Goals

- Make daily English speaking practice easy and low-pressure.
- Give clear, actionable feedback without interrupting the conversation constantly.
- Help learners notice recurring mistakes and measure improvement over time.
- Support a local-first setup using Ollama for language-model responses.

## Feature Roadmap

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

## Architecture

Use **Next.js with the App Router and TypeScript** for a single full-stack application. The user interface and server-side API routes live in the same codebase; a separate Express server is not required for the MVP.

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

- **Frontend:** React components rendered through Next.js.
- **Backend:** Next.js Route Handlers for chat, sessions, feedback, vocabulary, and progress.
- **AI:** Ollama running locally, with a configurable model and endpoint. Ollama remains a separate service that Next.js calls from the server.
- **Persistence:** SQLite with Prisma ORM for the MVP; PostgreSQL can be considered later.
- **Speech:** Browser speech-recognition and speech-synthesis APIs initially, with text-only fallback.
- **Validation:** Validate API input on the server and keep model configuration and prompts out of client-side code.
- **Testing:** Unit tests for prompt construction and validation, plus integration tests for Route Handlers and session persistence.

## Suggested MVP

Build these in order so the project becomes usable quickly:

1. Create the Next.js App Router project with TypeScript.
2. Build a responsive chat interface with topic and difficulty selection.
3. Add a server-side chat Route Handler that connects to Ollama.
4. Preserve conversation context within each session.
5. Add grammar corrections and natural-sentence suggestions.
6. Save conversation history in SQLite using Prisma.
7. Generate an end-of-session summary.
8. Add browser speech input and AI text-to-speech, with a text-only fallback.

## Suggested Technology Stack

- **Full-stack framework:** Next.js (App Router) + React + TypeScript.
- **Server API:** Next.js Route Handlers at `src/app/api/**/route.ts`; no separate Express server for the MVP.
- **AI runtime:** Ollama with a configurable local chat model.
- **Database and ORM:** SQLite + Prisma.
- **Speech:** Browser Speech Recognition and Speech Synthesis APIs initially.
- **Testing:** Unit and integration tests for API routes, prompts, and persistence.

## Development Principles

- Prioritize a responsive, uncluttered interface.
- Keep conversation flow natural; avoid correcting every sentence unless the learner asks for it.
- Make feedback specific and actionable.
- Do not expose secrets or internal server configuration to the browser.
- Treat voice support as an optional enhancement, not a requirement for text practice.
- Deliver the MVP before implementing advanced analytics and gamification.

## Status

This repository currently defines the product direction and feature roadmap. Features are planned, not implemented, until their checkboxes are completed and verified.
