"use client";

import { useEffect, useMemo, useState } from "react";
import { getSessions, type PracticeSession } from "@/lib/learning-storage";
import { initializeDatabasePersistence } from "@/lib/client-persistence";

type Weakness = { original: string; improved: string; reason: string; count: number; scenario: string };
type QuizQuestion = { prompt: string; options: string[]; answer: string; explanation: string };

function collectWeaknesses(sessions: PracticeSession[]): Weakness[] {
  const map = new Map<string, Weakness>();
  for (const session of sessions) {
    const seenInSession = new Set<string>();
    for (const correction of session.summary?.corrections ?? []) {
      const original = correction.original.trim();
      const improved = correction.improved.trim();
      if (!original || !improved || original.toLowerCase() === improved.toLowerCase()) continue;
      const key = original.toLowerCase() + "=>" + improved.toLowerCase();
      if (seenInSession.has(key)) continue;
      seenInSession.add(key);
      const current = map.get(key);
      if (current) current.count += 1;
      else map.set(key, { original, improved, reason: correction.reason, count: 1, scenario: session.scenario });
    }
  }
  return [...map.values()].filter((item) => item.count >= 2).sort((a, b) => b.count - a.count).slice(0, 5);
}

export function MistakeMicroLessons() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [active, setActive] = useState<Weakness | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [choice, setChoice] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (active) setSessions(getSessions());
    }).catch(() => {
      if (active) setError("Could not load saved practice history. Refresh the page to retry.");
    });
    return () => { active = false; };
  }, []);
  const weaknesses = useMemo(() => collectWeaknesses(sessions), [sessions]);
  const question = questions[questionIndex];

  async function startLesson(weakness: Weakness) {
    setActive(weakness); setQuestions([]); setQuestionIndex(0); setChoice(""); setRevealed(false); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/micro-lessons", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original: weakness.original, improved: weakness.improved, reason: weakness.reason }),
      });
      const payload = await response.json() as { questions?: QuizQuestion[]; error?: string };
      if (!response.ok || !Array.isArray(payload.questions) || payload.questions.length !== 3) throw new Error(payload.error || "Could not generate the three-question lesson.");
      setQuestions(payload.questions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the lesson. Check that Ollama is running.");
    } finally { setLoading(false); }
  }

  function leaveLesson() {
    setActive(null); setQuestions([]); setQuestionIndex(0); setChoice(""); setRevealed(false); setError(""); setLoading(false);
  }

  return <section className="learning-feature-panel micro-lessons-panel">
    <div className="learning-feature-heading"><div><p className="eyebrow">LEARN FROM YOUR HISTORY</p><h2>Micro-lessons from recurring mistakes</h2><p>Repeated corrections from separate saved sessions are sent to your AI tutor to generate three different practice questions targeting that exact weakness.</p></div><span className="feature-symbol" aria-hidden="true">✎</span></div>
    {!weaknesses.length ? <div className="feature-empty"><strong>No recurring pattern yet</strong><p>Complete and save session summaries with corrections. A lesson appears when the same original-to-improved correction is recorded in at least two separate session summaries.</p></div> : !active ? <div className="micro-lesson-list">{weaknesses.map((weakness) => <article key={weakness.original + weakness.improved} className="micro-lesson-item"><div><strong>{weakness.original} <span aria-hidden="true">→</span> {weakness.improved}</strong><p>{weakness.reason}</p><small>Seen in {weakness.count} session summaries · e.g. {weakness.scenario}</small></div><button type="button" className="button button-outline" disabled={loading} onClick={() => void startLesson(weakness)}>Generate AI lesson</button></article>)}</div> : <div className="micro-quiz"><div className="micro-quiz-top"><strong>{loading ? "Generating your lesson…" : question ? `Question ${questionIndex + 1} of 3` : "Targeted practice"}</strong><button className="text-link" type="button" onClick={leaveLesson}>All lessons</button></div>{loading && <p role="status">Your tutor is building varied examples around this recurring mistake…</p>}{error && <div><p className="feature-feedback" role="alert">{error}</p><button type="button" className="button button-outline" onClick={() => void startLesson(active)}>Try again</button></div>}{question && !loading && <><h3>{question.prompt}</h3><div className="micro-quiz-options">{question.options.map((option) => <button type="button" key={option} className={choice === option ? "micro-quiz-option selected" : "micro-quiz-option"} onClick={() => { if (!revealed) setChoice(option); }}>{option}</button>)}</div>{revealed && <p className={choice === question.answer ? "quiz-correct" : "quiz-review"} role="status"><strong>{choice === question.answer ? "Correct." : "Review this pattern."}</strong> {question.explanation}<br />Suggested answer: {question.answer}</p>}<div className="micro-quiz-actions">{!revealed ? <button className="button button-primary" type="button" disabled={!choice} onClick={() => setRevealed(true)}>Check answer</button> : <button className="button button-primary" type="button" onClick={() => { if (questionIndex === 2) { leaveLesson(); setSessions(getSessions()); } else { setQuestionIndex((index) => index + 1); setChoice(""); setRevealed(false); } }}>{questionIndex === 2 ? "Finish lesson" : "Next question"}</button>}</div></>}</div>}
  </section>;
}
