# Interactive Video Learning — Feature Specification

## Goal

Add an interactive video-based English learning experience to the existing SpeakUp AI application. This is an extension to the current Next.js app, not a separate application.

## Repository findings

- Stack: Next.js App Router, React 19, TypeScript.
- UI: shared `AppShell` and current design system in `src/app/globals.css`.
- Existing spoken audio playback: `src/lib/speech-playback.ts`, reused by `src/components/listen-button.tsx`.
- Existing pronunciation/shadowing: `src/components/shadowing-practice.tsx`, route `/shadowing`.
- Vocabulary storage and review: `src/lib/learning-storage.ts`, `src/components/vocabulary-notebook.tsx`.
- Existing AI definitions/examples: `POST /api/vocabulary/define`.
- Existing learning evidence/assessment: `src/lib/learning-evidence-client.ts` and `POST /api/learning/attempts`.
- Existing owner-scoped database persistence: `/api/persistence`, using the HTTP-only `speakup_owner` cookie.
- Existing progress/analytics: `/progress`, `src/components/learning-insights.tsx`, and learning evidence endpoints.

## Learner flow

1. Open **Video Learning** from the main navigation.
2. Pick a curated video/lesson or enter a supported video URL.
3. Play/pause, seek, replay a sentence, and adjust playback speed.
4. Read subtitles synchronized with video playback.
5. Click a word to open a vocabulary panel with meaning, pronunciation/audio, and examples.
6. Save a word or phrase to the existing Vocabulary notebook.
7. View sentence translation/explanation when provided for the lesson.
8. Use a repeat/shadowing mode to listen to a sentence and speak it aloud.
9. Review the session summary and history; completed activities can contribute to learning evidence and progress.

## UX requirements

- Consistent with SpeakUp AI's current visual system and `AppShell`.
- Responsive desktop/mobile layout.
- Clear playback state, loading/error states, no-subtitles state, and unsupported-video message.
- Keyboard accessible controls; accessible labels for play, pause, speed, subtitle settings, and vocabulary actions.
- Do not autoplay audio unexpectedly.
- Preserve current pages and routes.

## MVP scope (recommended first release)

### 1. Lesson catalogue
- Small curated list of lessons with title, level, duration, topic, media source and subtitle availability.
- Lesson metadata comes from typed local data first; no separate video CMS for MVP.
- Support approved media sources that can be embedded or played reliably. Do not assume arbitrary video URLs are embeddable.

### 2. Video player + synchronized subtitles
- Playback controls: play/pause, timeline/seek, replay current subtitle/sentence, speed options (0.75x, 1x, 1.25x, 1.5x).
- Subtitle cue model: `id`, `startMs`, `endMs`, `text`, optional translation.
- Determine active subtitle from media time; clicking a cue seeks to its start.
- Use a native HTML video element for direct media files. For external platforms, use a provider-specific adapter where embedding is allowed. Keep playback integration behind a small component boundary.
- Support supplied WebVTT or structured subtitle JSON. Automatic transcription/alignment is not part of MVP unless a separate speech-to-text service is configured.

### 3. Clickable word lookup
- Render subtitle words as accessible buttons without losing punctuation or spaces.
- Selecting a word sends the normalized word/phrase to `POST /api/vocabulary/define`.
- Show definition, example, and category; play pronunciation with existing speech playback.
- Let the learner save to the existing vocabulary store; avoid duplicate entries.

### 4. Sentence practice / shadowing
- Replay one cue or the whole sentence.
- “Practise this sentence” opens/reuses the existing shadowing component with the selected sentence (the current `ShadowingPractice` already accepts `initialTarget`).
- Capture an attempt only when the learner actually performs it; do not infer completion merely from video playback.

### 5. Progress and persistence
- Record lesson started/completed, watch duration, subtitle replays, vocabulary saves, and completed shadowing attempts where feasible.
- Reuse existing owner-scoped persistence/evidence APIs and learning analytics; add a dedicated table/route only if current structures cannot safely represent a video lesson.
- Ensure writes are owner-scoped and idempotent, validate payloads, and make history loading/saving failures visible to the learner.
- Do not save arbitrary full video transcripts or large blobs in generic persistence.

## Suggested implementation boundaries

- `src/app/video-learning/page.tsx`: new page using `AppShell`.
- `src/components/video-learning.tsx`: client-side composition and lesson selection.
- `src/components/video-player.tsx`: provider/media adapter and playback controls.
- `src/components/video-subtitles.tsx`: cue timing, click-to-seek, clickable words and active cue highlighting.
- `src/components/video-vocabulary-panel.tsx`: selected-word detail + save actions.
- `src/lib/video-lessons.ts`: typed curated lesson catalogue.
- `src/lib/video-subtitles.ts`: cue schema, cue lookup and WebVTT parsing utilities.
- `src/app/api/video-learning/history/route.ts` (optional): add only after deciding whether the existing learning-evidence model can represent events cleanly.
- `src/components/app-shell.tsx`: add a `video-learning` PageKey and navigation entry.
- `src/app/globals.css`: responsive styles consistent with existing tokens/components.

These are proposed file boundaries; check the current tree again before implementation and adapt to existing patterns.

## Not in MVP / follow-up phases

- AI-generated subtitles for arbitrary URLs.
- Word-by-word time alignment for each spoken word (requires word-level timestamps or forced alignment; sentence-level cues alone cannot provide accurate word timing).
- Automatic translations for every language.
- Full YouTube ingestion/downloading or bypassing platform restrictions.
- Pronunciation scoring beyond the capabilities of existing browser transcript comparison / optional pronunciation service.
- Accounts or cross-device sync (the current app has no sign-in system).

## Technical and product decisions to settle during implementation

1. First supported source: local/direct MP4 + WebVTT is the simplest controlled MVP; add YouTube embeds or another provider through a separate adapter after validating playback and API constraints.
2. Content rights: use owned/licensed media or sources explicitly permitting embedding.
3. Translation source: store reviewed translations per subtitle cue initially; AI translation can be an opt-in fallback.
4. Vocabulary definitions continue to use the configured Ollama model via the existing server route.
5. Subtitle cue timestamps must be source-provided or manually reviewed; do not claim word-level synchronization when only sentence timing exists.

## Acceptance criteria

- A learner can open a lesson and operate playback without leaving SpeakUp AI.
- The active subtitle follows media time; clicking a cue jumps to that sentence.
- Clicking a subtitle word opens its definition and example without breaking subtitle layout.
- Pronunciation/audio playback works through existing speech utilities and does not trigger automatically.
- A selected word can be saved to existing Vocabulary and appears in the current notebook after persistence refresh.
- The sentence can be sent into the existing shadowing practice using `initialTarget`.
- UI works at mobile and desktop sizes and has loading/error/empty states.
- New routes/components have unit tests for cue timing, cue seek behavior, WebVTT parsing and word-token rendering; the page receives Playwright coverage.
- Existing lint, typecheck, Vitest, build, and Playwright checks pass.

## Suggested delivery order

1. Catalogue + player adapter + sentence-level synchronized subtitles.
2. Clickable word lookup + definitions/examples + save to Vocabulary.
3. Sentence replay + link to shadowing practice.
4. Owner-scoped history and learning evidence/progress integration.
5. Provider adapters, richer translation workflow, and more advanced transcript/alignment support.

## Links to existing integration points

- [Repository](https://github.com/uttarooque73/learn-english)
- [README / architecture](https://github.com/uttarooque73/learn-english/blob/main/README.md)
- [App navigation](https://github.com/uttarooque73/learn-english/blob/main/src/components/app-shell.tsx)
- [Shadowing component](https://github.com/uttarooque73/learn-english/blob/main/src/components/shadowing-practice.tsx)
- [Vocabulary definitions API](https://github.com/uttarooque73/learn-english/blob/main/src/app/api/vocabulary/define/route.ts)
- [Vocabulary notebook](https://github.com/uttarooque73/learn-english/blob/main/src/components/vocabulary-notebook.tsx)
- [Learning evidence client](https://github.com/uttarooque73/learn-english/blob/main/src/lib/learning-evidence-client.ts)
