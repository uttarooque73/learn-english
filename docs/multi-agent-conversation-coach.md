# Multi-Agent English Conversation Coach

## Scope

Extend the existing SpeakUp AI Conversation Coach. This is a conversation feature, not a video feature. Keep the current chat interface, role-play scenarios, speech recognition/playback, session history, and SQLite persistence.

## Per-turn orchestration

The new `POST /api/conversation-coach/turn` endpoint coordinates three focused Ollama agents concurrently:

1. **Conversation Agent** returns the natural next reply for the existing scenario and learner level.
2. **Language Feedback Agent** returns up to two evidence-based corrections for the learner's latest message.
3. **Contextual Vocabulary Agent** returns up to two useful expressions, concise meanings, and example sentences.

The UI continues to show one conversation partner. Corrections appear with the learner's message; contextual expressions appear with the tutor response. Agent internals and prompts are not exposed.

## Reliability and input handling

- Validate the JSON body, message count, roles, and message lengths.
- Bound the context to the latest 12 messages and request history to 20 messages.
- Use the configured `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
- Run specialist agents in parallel with bounded request timeouts.
- The main conversation reply is required; language feedback and vocabulary are optional and fail independently.
- Return no-store responses and bounded structured output.
- Continue using the existing owner-scoped session persistence API.

## Existing features retained

This change reuses the existing Conversation Coach UI, scenario and difficulty controls, voice input/output, SQLite-backed session history, and end-of-session review. It does not introduce video features or duplicate the existing adaptive learning-plan/evaluation LangGraph workflows.

## Local verification

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The turn endpoint requires the configured Ollama server and model for end-to-end testing.
