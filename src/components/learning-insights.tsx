"use client";

import { useEffect, useMemo, useState } from "react";
import { getSessions, getVocabulary, removeVocabulary, type PracticeSession, type SavedVocabulary } from "@/lib/learning-storage";
import { getLearningAnalytics } from "@/lib/learning-analytics";

export function LearningInsights({ mode }: { mode: "overview" | "progress" | "vocabulary" }) {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [words, setWords] = useState<SavedVocabulary[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSessions(getSessions());
      setWords(getVocabulary());
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const totalSeconds = useMemo(() => sessions.reduce((sum, session) => sum + session.durationSeconds, 0), [sessions]);
  const minutes = Math.round(totalSeconds / 60);
  const practicedDays = new Set(sessions.map((session) => session.startedAt.slice(0, 10))).size;
  const messages = sessions.reduce((sum, session) => sum + session.messageCount, 0);
  const analytics = useMemo(() => getLearningAnalytics(sessions, words), [sessions, words]);
  const maxDailySessions = Math.max(1, ...analytics.recentActivity.map((day) => day.sessions));

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
        <div className="analytics-grid">
          <section className="insights-panel streak-panel" aria-labelledby="practice-streak-heading">
            <div className="analytics-panel-heading"><div><p className="eyebrow">CONSISTENCY</p><h2 id="practice-streak-heading">Practice streak</h2></div><span className="streak-symbol" aria-hidden="true">✦</span></div>
            <div className="streak-metrics">
              <div><strong>{analytics.currentStreak}</strong><span>Current days</span></div>
              <div><strong>{analytics.longestStreak}</strong><span>Longest streak</span></div>
            </div>
            <p className="analytics-support">{analytics.currentStreak > 0 ? "Nice work showing up. Practice today to keep your streak going." : "One short conversation today is enough to start a new streak."}</p>
          </section>
          <section className="insights-panel weekly-panel" aria-labelledby="weekly-activity-heading">
            <div className="analytics-panel-heading"><div><p className="eyebrow">LAST 7 DAYS</p><h2 id="weekly-activity-heading">Your weekly rhythm</h2></div><span className="section-note">{analytics.practiceDaysThisWeek} days this week</span></div>
            <div className="week-bars" role="list" aria-label="Practice activity for the last seven days">
              {analytics.recentActivity.map((day) => <div className="week-bar-column" role="listitem" key={day.date} aria-label={`${day.label}: ${day.sessions} sessions, ${day.minutes} minutes`}>
                <span className="week-bar-value">{day.sessions || ""}</span>
                <div className="week-bar-track"><div className={`week-bar-fill ${day.sessions ? "has-practice" : ""}`} style={{ height: `${day.sessions ? Math.max(12, (day.sessions / maxDailySessions) * 100) : 4}%` }} /></div>
                <span className="week-bar-label">{day.label}</span>
              </div>)}
            </div>
            <div className="period-stats"><div><strong>{analytics.sessionsThisWeek}</strong><span>Sessions this week</span></div><div><strong>{analytics.minutesThisWeek} min</strong><span>Practice time this week</span></div><div><strong>{analytics.sessionsThisMonth}</strong><span>Sessions this month</span></div><div><strong>{analytics.minutesThisMonth} min</strong><span>Practice time this month</span></div></div>
          </section>
        </div>
        <div className="analytics-grid">
          <section className="insights-panel" aria-labelledby="vocabulary-analytics-heading">
            <div className="section-heading"><div><p className="eyebrow">VOCABULARY</p><h2 id="vocabulary-analytics-heading">Review progress</h2></div></div>
            <div className="analytics-vocab-stats"><div><strong>{words.length}</strong><span>Saved items</span></div><div><strong>{analytics.reviewedVocabularyCount}</strong><span>Items reviewed</span></div><div><strong>{analytics.totalReviews}</strong><span>Total reviews</span></div><div><strong>{analytics.masteredVocabularyCount}</strong><span>Marked mastered</span></div></div>
            <p className="analytics-support">Counts reflect saved review history in this browser, not a proficiency score.</p>
          </section>
          <section className="insights-panel" aria-labelledby="correction-patterns-heading">
            <div className="section-heading"><div><p className="eyebrow">SESSION FEEDBACK</p><h2 id="correction-patterns-heading">Correction patterns</h2></div></div>
            {analytics.commonCorrections.length ? <div className="correction-pattern-list">{analytics.commonCorrections.map((correction) => <article className="correction-pattern" key={`${correction.original}-${correction.improved}`}><span>{correction.original}</span><span aria-hidden="true">→</span><strong>{correction.improved}</strong><small>{correction.count} {correction.count === 1 ? "summary" : "summaries"}</small></article>)}</div> : <div className="insights-empty"><h3>Patterns will appear as you review sessions</h3><p>Generate session summaries to see repeated corrections across your saved practice history.</p></div>}
          </section>
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
