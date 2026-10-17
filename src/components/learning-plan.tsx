"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import { getSessions, getVocabulary, reviewVocabulary, type SavedVocabulary, type PracticeSession } from "@/lib/learning-storage";
import { getLearningAnalytics } from "@/lib/learning-analytics";

const ACTIVITIES = [
  { title: "Review due vocabulary", minutes: 5, href: "/vocabulary", detail: "Strengthen words you have already learned." },
  { title: "Speak with your AI coach", minutes: 10, href: "/conversation-coach", detail: "Use complete sentences and learn from corrections." },
  { title: "Shadow a native-style sentence", minutes: 5, href: "/shadowing", detail: "Listen, repeat, and compare your attempt." },
  { title: "Practice a fluency exercise", minutes: 5, href: "/fluency", detail: "Build faster, more natural responses." },
  { title: "Check your progress", minutes: 2, href: "/progress", detail: "Review your streak and recurring mistakes." },
];

export function LearningPlan() {
  const [words, setWords] = useState<SavedVocabulary[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [ready, setReady] = useState(false);
  const [target, setTarget] = useState(25);
  const [completed, setCompleted] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setWords(getVocabulary());
    setSessions(getSessions());
  }, []);

  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (!active) return;
      refresh();
      setReady(true);
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [refresh]);

  const dueWords = useMemo(() => {
    const now = Date.now();
    return words.filter(word => !word.nextReviewAt || Date.parse(word.nextReviewAt) <= now).slice(0, 8);
  }, [words]);
  const analytics = useMemo(() => getLearningAnalytics(sessions, words), [sessions, words]);
  const plannedMinutes = Math.min(target, ACTIVITIES.reduce((sum, item) => sum + item.minutes, 0));
  const toggleActivity = (title: string) => setCompleted(current => current.includes(title) ? current.filter(item => item !== title) : [...current, title]);

  function rateWord(id: string, rating: "again" | "good" | "easy") {
    reviewVocabulary(id, rating);
    refresh();
  }

  if (!ready) return <section className="section-block"><p>Loading your saved learning data…</p></section>;

  return (
    <div className="learning-plan">
      <section className="next-step-card">
        <div className="next-step-icon">✦</div>
        <div>
          <strong>Your plan for today</strong>
          <p>A balanced session connects vocabulary, speaking, pronunciation, and reflection. Your saved words and practice sessions shape this plan.</p>
          <label>Daily time target{" "}
            <select aria-label="Daily time target" value={target} onChange={event => setTarget(Number(event.target.value))}>
              <option value={10}>10 minutes</option><option value={15}>15 minutes</option><option value={25}>25 minutes</option><option value={30}>30 minutes</option>
            </select>
          </label>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">TODAY'S ROUTINE</p><h2>{completed.length} of {ACTIVITIES.length} activities completed</h2></div><span className="section-note">{plannedMinutes} minute target</span></div>
        <div className="stats-grid">
          {ACTIVITIES.map(activity => (
            <article className="stat-card" key={activity.title}>
              <div className="stat-top">
                <label><input type="checkbox" checked={completed.includes(activity.title)} onChange={() => toggleActivity(activity.title)} /> Done</label>
                <span className="stat-tag">{activity.minutes} MIN</span>
              </div>
              <h3>{activity.title}</h3><p>{activity.detail}</p>
              <Link className="text-link" href={activity.href}>Start activity <span>→</span></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">SPACED REPETITION</p><h2>Words due for review</h2></div><Link className="text-link" href="/vocabulary">Open word bank →</Link></div>
        {dueWords.length === 0 ? <div className="next-step-card"><div><strong>You're all caught up.</strong><p>Save new words during practice and they will appear here when they are due for review.</p></div></div> :
          <div className="stats-grid">{dueWords.map(word => (
            <article className="stat-card" key={word.id}>
              <div className="stat-top"><span className="stat-tag">{word.category ?? "VOCABULARY"}</span><span className="stat-tag">{word.reviewCount ?? 0} reviews</span></div>
              <h3>{word.phrase}</h3><p>{word.meaning}</p>{word.example && <p><em>{word.example}</em></p>}
              <div className="review-actions" aria-label={`Review ${word.phrase}`}>
                <button type="button" onClick={() => rateWord(word.id, "again")}>Again</button>
                <button type="button" onClick={() => rateWord(word.id, "good")}>Good</button>
                <button type="button" onClick={() => rateWord(word.id, "easy")}>Easy</button>
              </div>
            </article>
          ))}</div>}
      </section>

      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">YOUR FEEDBACK LOOP</p><h2>Practice, notice, improve</h2></div></div>
        <div className="next-step-card"><div><strong>{analytics.currentStreak} day current streak</strong><p>{analytics.commonCorrections.length ? `One pattern to revisit: “${analytics.commonCorrections[0].original}” → “${analytics.commonCorrections[0].improved}”.` : "Your conversation corrections will appear here as you complete saved practice sessions."}</p><p>Saved sessions: {sessions.length} · Vocabulary bank: {words.length} items</p></div><Link className="text-link" href="/progress">View analytics →</Link></div>
      </section>
    </div>
  );
}
