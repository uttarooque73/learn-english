"use client";

import { useEffect, useMemo, useState } from "react";
import { getSessions, getVocabulary, removeVocabulary, type PracticeSession, type SavedVocabulary } from "@/lib/learning-storage";

export function LearningInsights({ mode }: { mode: "overview" | "progress" | "vocabulary" }) {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [words, setWords] = useState<SavedVocabulary[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessions(getSessions());
    setWords(getVocabulary());
    setReady(true);
  }, []);

  const totalSeconds = useMemo(() => sessions.reduce((sum, session) => sum + session.durationSeconds, 0), [sessions]);
  const minutes = Math.round(totalSeconds / 60);
  const practicedDays = new Set(sessions.map((session) => session.startedAt.slice(0, 10))).size;
  const messages = sessions.reduce((sum, session) => sum + session.messageCount, 0);

  if (!ready) return <section className="learning-insights" aria-live="polite"><p>Loading your learning data…</p></section>;

  if (mode === "overview") {
    return (
      <div className="stats-grid">
        <article className="stat-card"><div className="stat-top"><span className="stat-icon peach">◷</span><span className="stat-tag">PRACTICE</span></div><div className="stat-value">{minutes} <small>min</small></div><p>Practice time</p><div className="stat-foot"><span className="stat-line peach-line" />Time spent learning</div></article>
        <article className="stat-card"><div className="stat-top"><span className="stat-icon lavender">✦</span><span className="stat-tag">CONSISTENCY</span></div><div className="stat-value">{sessions.length}</div><p>Sessions completed</p><div className="stat-foot"><span className="stat-line lavender-line" />Every conversation counts</div></article>
        <article className="stat-card"><div className="stat-top"><span className="stat-icon mint">Aa</span><span className="stat-tag">VOCABULARY</span></div><div className="stat-value">{words.length}</div><p>Words and phrases saved</p><div className="stat-foot"><span className="stat-line mint-line" />Collect useful expressions</div></article>
      </div>
    );
  }

  if (mode === "progress") {
    return (
      <section className="learning-insights">
        <div className="stats-grid progress-stats">
          <article className="stat-card"><div className="stat-top"><span className="stat-icon peach">◷</span><span className="stat-tag">TIME</span></div><div className="stat-value">{minutes} <small>min</small></div><p>Total practice time</p><div className="stat-foot">Time spent in saved sessions</div></article>
          <article className="stat-card"><div className="stat-top"><span className="stat-icon lavender">↗</span><span className="stat-tag">CONSISTENCY</span></div><div className="stat-value">{sessions.length}</div><p>Sessions practiced</p><div className="stat-foot">{practicedDays} practice days</div></article>
          <article className="stat-card"><div className="stat-top"><span className="stat-icon mint">Aa</span><span className="stat-tag">CONVERSATION</span></div><div className="stat-value">{messages}</div><p>Your messages sent</p><div className="stat-foot">{words.length} saved vocabulary items</div></article>
        </div>
        <div className="insights-panel">
          <div className="section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Your practice history</h2></div><span className="section-note">Stored on this browser</span></div>
          {sessions.length ? <div className="activity-list">{sessions.slice(0, 12).map((session) => <article className="activity-row" key={session.id}><div className="activity-icon">✦</div><div className="activity-copy"><strong>{session.scenario}</strong><span>{new Date(session.startedAt).toLocaleString()} · {session.messageCount} messages</span></div><span className="activity-duration">{Math.max(1, Math.round(session.durationSeconds / 60))} min</span></article>)}</div> : <div className="insights-empty"><h3>Your first session sets the baseline</h3><p>Complete a conversation in Practice Room and it will appear here.</p></div>}
        </div>
        <p className="storage-note">Your learning data is stored in this browser only. Clearing browser storage will remove it.</p>
      </section>
    );
  }

  return (
    <section className="learning-insights">
      <div className="vocabulary-toolbar"><div><strong>{words.length} saved {words.length === 1 ? "item" : "items"}</strong><p>Useful phrases you can revisit and practice.</p></div></div>
      {words.length ? <div className="saved-word-grid">{words.map((word) => <article className="saved-word-card" key={word.id}><div className="saved-word-top"><span className="stat-icon mint">Aa</span><button className="remove-word" type="button" onClick={() => { removeVocabulary(word.id); setWords(getVocabulary()); }} aria-label={`Remove ${word.phrase}`}>Remove</button></div><h3>{word.phrase}</h3><p>{word.meaning}</p><blockquote>{word.example}</blockquote><span className="saved-date">Saved {new Date(word.savedAt).toLocaleDateString()}</span></article>)}</div> : <div className="insights-empty"><h3>Your word bank starts here</h3><p>In Practice Room, ask for feedback and save useful vocabulary suggestions to build your personal word bank.</p></div>}
      <p className="storage-note">Vocabulary is stored in this browser only, not sent to a remote database.</p>
    </section>
  );
}
