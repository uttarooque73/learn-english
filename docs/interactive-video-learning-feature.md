# Multi-Agent English Conversation Coach — Feature Specification

## Goal

Build an immersive, ongoing English conversation experience inside the existing SpeakUp AI app. The learner talks or types naturally with one visible AI conversation partner. Behind the scenes, specialized agents collaborate to guide the conversation, detect language issues, teach useful expressions, and track progress.

This is NOT a video feature and should not appear as multiple separate bots the learner has to switch between.

## Repository findings

- Stack: Next.js App Router, React 19, TypeScript.
- Shared application UI/navigation: `src/components/app-shell.tsx`.
- Existing conversation page/feature: `src/app/conversation-coach` (inspect current implementation before changing).
- Existing pronunciation/shadowing: `src/components/shadowing-practice.tsx`.
- Existing speech playback: `src/lib/speech-playback.ts`.
- Existing vocabulary store and notebook: `src/lib/learning-storage.ts`, `src/components/vocabulary-notebook.tsx`.
- Existing Ollama integration pattern: `POST /api/vocabulary/define`, configured through `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
- Existing learning evidence/evaluation: `src/lib/learning-evidence-client.ts`, `POST /api/learning/attempts`.
- Existing owner-scoped persistence uses SQLite and the `speakup_owner` cookie.

## Learner experience

1. Learner opens Conversation Coach and chooses a situation (daily life, workplace, interview, travel, meeting, small talk) or starts a free conversation.
2. The app shows one coherent AI partner and a chat transcript. The learner can type or speak.
3. A Conversation Agent replies naturally and keeps the conversation moving with relevant follow-up questions.
4. A Language Analysis Agent reviews the learner's message for important grammar, vocabulary, and phrasing issues.
5. A Vocabulary Agent identifies one or two useful expressions when it adds value.
6. A Coach/Orchestrator decides what feedback to show now versus defer, so the conversation is not interrupted after every sentence.
7. A Session Memory/Learner State component updates a compact profile of level, recurring errors, learned phrases, interests, and goals.
8. At the end of a session, an Evaluation Agent summarizes strengths, priority corrections, useful phrases, and a focused next exercise.

The learner sees one conversation partner, not internal agent-to-agent messages. An optional “Why this feedback?” disclosure may show a concise explanation.

## Agent responsibilities

### 1. Orchestrator / Conversation Manager
- Owns the session state, turn order, current scenario, learner level, and response contract.
- Decides which agents to invoke based on the learner's message and conversation state.
- Runs independent analyses in parallel when useful, with strict timeouts and bounded output.
- Chooses which corrections to surface immediately and which to include in end-of-session feedback.
- Produces the final response in a single consistent tutor voice.

### 2. Conversation Agent (user-facing)
- Generates the actual reply to the learner.
- Maintains conversational context and asks one natural follow-up question when appropriate.
- Adapts complexity to the learner's level and selected scenario.
- Does not turn every reply into a grammar lecture.

### 3. Language Feedback Agent
- Analyses the learner's latest message.
- Returns structured feedback: original excerpt, correction, short explanation, severity/priority, and a more natural alternative.
- Distinguishes genuine errors from acceptable informal English and regional variation.
- Avoids inventing mistakes or over-correcting stylistic preferences.

### 4. Vocabulary Agent
- Finds useful words, collocations, phrasal verbs, and idiomatic expressions in context.
- Provides concise meaning and one natural example.
- Can call the existing vocabulary-definition endpoint or use its own narrowly scoped prompt.
- Saves vocabulary only after explicit learner action, using existing storage.

### 5. Learner State / Memory component
- Retrieves relevant profile, goals, past feedback, saved vocabulary, and recurring mistakes.
- Updates compact, structured session state after each turn.
- Uses existing owner-scoped persistence. Do not send the entire database history to the model.
- Offers an explicit way to clear/reset conversation memory.

### 6. Session Evaluator (end of session or background)
- Produces a session summary: fluency, grammar patterns, vocabulary use, confidence signals, and recommended practice.
- Uses evidence from actual learner messages and agent outputs; never fabricates numeric scores.
- Can submit supported evidence to the current learning-progress system.

## Recommended architecture

Use a **single user-facing conversation agent with an orchestrator and focused specialist agents**. Not every agent needs to be a separately deployed service or a separate model. Start with modules/prompts calling the existing local Ollama model; allow different models or providers later if quality and latency justify it.

Synchronous path per turn:
1. Validate request and load session + compact learner context.
2. Run the Conversation Agent to produce the conversational draft.
3. In parallel, run Language Feedback and Vocabulary analysis on the learner's latest message when needed.
4. Validate the structured agent outputs.
5. Orchestrator combines the reply with a small amount of timely feedback.
6. Return one response and persist the turn/session state.

If response latency becomes high, return the conversational reply first and calculate optional feedback asynchronously. Keep the initial implementation simple and observable.

## Suggested implementation boundaries

These are proposed boundaries; inspect the current Conversation Coach implementation and reuse or refactor it rather than creating a duplicate page.

- `src/app/conversation-coach/page.tsx`: retain or extend existing page.
- `src/components/conversation-coach.tsx`: chat UI, session controls, input, transcript, and feedback drawer; reuse existing component if present.
- `src/app/api/conversation-coach/route.ts`: session-turn endpoint, or adapt the existing endpoint after inspection.
- `src/lib/agents/conversation-agent.ts`: user-facing dialogue generation.
- `src/lib/agents/language-feedback-agent.ts`: structured corrections.
- `src/lib/agents/vocabulary-agent.ts`: contextual vocabulary suggestions.
- `src/lib/agents/session-evaluator.ts`: end-of-session summary.
- `src/lib/agents/orchestrator.ts`: routing, timeouts, output validation, synthesis.
- `src/lib/agents/schemas.ts`: runtime schemas/types for agent outputs.
- `src/lib/conversation-session-store.ts`: compact state and persistence integration; reuse existing persistence where possible.
- `src/components/app-shell.tsx`: keep existing Conversation Coach navigation unless a rename is intentional.
- `src/app/globals.css`: follow the existing design system.

Do not add a new database table until the existing persistence and learning-domain models have been reviewed for suitable session/turn storage.

## API contract (illustrative)

Request:
- `sessionId` (optional when starting a session)
- `message`
- `scenario` / `level` (optional)
- `mode`: `conversation` or `practice`

Response:
- `sessionId`
- `reply`: user-facing assistant message
- `feedback`: optional structured corrections
- `vocabulary`: optional list of useful expressions
- `nextPrompt`: optional follow-up prompt
- `sessionState`: compact, non-sensitive state summary where appropriate

Use a strict schema and length limits. Treat learner messages as untrusted content, not system instructions. Never expose hidden agent prompts or internal reasoning.

## Voice interaction

- Reuse the current browser speech-recognition and speech-playback capabilities where supported.
- Show recording/listening state, allow the learner to stop or edit a transcript before sending.
- Do not automatically record in the background.
- Use a provider abstraction if later adding a dedicated speech-to-text or real-time voice API.
- Voice can be a second milestone; the text conversation and orchestration should work first.

## Reliability, safety, and cost

- Set per-agent timeouts, bounded input/context sizes, and safe fallbacks.
- If a specialist agent fails, still return the main conversation reply; show optional feedback as unavailable rather than failing the whole turn.
- Validate JSON from Ollama and retry malformed outputs at most once.
- Avoid calling every agent on every turn: use routing rules and run vocabulary analysis only when useful.
- Record latency, failures, and token/model usage where available; do not log sensitive raw audio.
- Use idempotency for writes and owner-scoped access for all session data.
- Do not claim pronunciation accuracy from text-only input.

## MVP scope

1. One conversation UI with scenario selection and text input.
2. Orchestrator + Conversation Agent powered by the configured Ollama model.
3. Language Feedback Agent returning structured corrections.
4. Vocabulary Agent with explicit save-to-notebook action.
5. Persist conversation history and compact learner state using existing owner-scoped storage.
6. End-session summary with evidence-grounded recommendations.
7. Automated tests for routing, malformed model output, partial agent failure, feedback schema, persistence isolation, and conversation context.

## Later enhancements

- Streaming responses and interruptible real-time voice.
- Multiple model providers or specialist models.
- More sophisticated long-term learner memory and spaced repetition.
- Scenario-specific role-play personas and difficulty adaptation.
- Evaluation dashboards comparing performance across sessions.

## Acceptance criteria

- The learner experiences one natural conversation, not a collection of disconnected bots.
- The conversation remains coherent across multiple turns and remembers the selected scenario.
- Language feedback references the learner's actual text and gives valid, helpful corrections.
- Vocabulary suggestions are contextual and can be saved to the existing notebook without duplicates.
- A specialist failure does not prevent the main conversation from continuing.
- Session history is scoped to the current app owner.
- The session summary is based on observed evidence, not invented scores.
- Existing app routes and learning features continue to work.
- Lint, typecheck, unit tests, build, and relevant Playwright tests pass.

## Existing integration references

- [Repository](https://github.com/uttarooque73/learn-english)
- [README](https://github.com/uttarooque73/learn-english/blob/main/README.md)
- [Conversation Coach component area](https://github.com/uttarooque73/learn-english/tree/main/src/app/conversation-coach)
- [Shadowing practice](https://github.com/uttarooque73/learn-english/blob/main/src/components/shadowing-practice.tsx)
- [Vocabulary definition API](https://github.com/uttarooque73/learn-english/blob/main/src/app/api/vocabulary/define/route.ts)
- [Vocabulary notebook](https://github.com/uttarooque73/learn-english/blob/main/src/components/vocabulary-notebook.tsx)
- [Learning evidence client](https://github.com/uttarooque73/learn-english/blob/main/src/lib/learning-evidence-client.ts)
