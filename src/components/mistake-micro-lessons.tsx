"use client";

import { useEffect, useMemo, useState } from "react";
import { getSessions, type PracticeSession } from "@/lib/learning-storage";

type Weakness = { original: string; improved: string; reason: string; count: number; scenario: string };
type QuizQuestion = { prompt: string; answer: string; explanation: string };

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
function makeQuestions(weakness: Weakness): QuizQuestion[] {
  return [
    { prompt: `Choose the improved version: “${weakness.original}”`, answer: weakness.improved, explanation: weakness.reason || "This version is more natural and grammatically appropriate." },
    { prompt: `Complete this correction: “${weakness.original}” → “${weakness.improved}”. Which phrase should you remember?`, answer: weakness.improved, explanation: "Read the improved sentence aloud and notice the word order and phrasing." },
    { prompt: `In your next conversation, how should you express the idea “${weakness.original}” naturally?`, answer: weakness.improved, explanation: "Try using this pattern in a new sentence, not only repeating the example." },
  ];
}

export function MistakeMicroLessons() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [active, setActive] = useState<Weakness | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [choice, setChoice] = useState("");
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setSessions(getSessions()), 0); return () => window.clearTimeout(timer); }, []);
  const weaknesses = useMemo(() => collectWeaknesses(sessions), [sessions]);
  const questions = active ? makeQuestions(active) : [];
  const question = questions[questionIndex];
  const options = question ? [question.answer, active?.original ?? "", "I am not sure yet."].filter((value, index, all) => value && all.indexOf(value) === index).sort((a, b) => a === question.answer ? -1 : b === question.answer ? 1 : a.localeCompare(b)) : [];
  return <section className="learning-feature-panel micro-lessons-panel">
    <div className="learning-feature-heading"><div><p className="eyebrow">LEARN FROM YOUR HISTORY</p><h2>Micro-lessons from recurring mistakes</h2><p>Repeated corrections in saved session summaries become short, targeted three-question reviews.</p></div><span className="feature-symbol" aria-hidden="true">✎</span></div>
    {!weaknesses.length ? <div className="feature-empty"><strong>No recurring pattern yet</strong><p>Complete and save session summaries with corrections. A lesson appears when the same correction is recorded in at least two summaries.</p></div> : !active ? <div className="micro-lesson-list">{weaknesses.map((weakness) => <article key={weakness.original + weakness.improved} className="micro-lesson-item"><div><strong>{weakness.original} <span aria-hidden="true">→</span> {weakness.improved}</strong><p>{weakness.reason}</p><small>Seen in {weakness.count} session summaries · e.g. {weakness.scenario}</small></div><button type="button" className="button button-outline" onClick={() => { setActive(weakness); setQuestionIndex(0); setChoice(""); setRevealed(false); }}>Start 3-question lesson</button></article>)}</div> : <div className="micro-quiz"><div className="micro-quiz-top"><strong>Question {questionIndex + 1} of 3</strong><button className="text-link" type="button" onClick={() => { setActive(null); setRevealed(false); }}>All lessons</button></div><h3>{question.prompt}</h3><div className="micro-quiz-options">{options.map((option) => <button type="button" key={option} className={choice === option ? "micro-quiz-option selected" : "micro-quiz-option"} onClick={() => { if (!revealed) setChoice(option); }}>{option}</button>)}</div>{revealed && <p className={choice === question.answer ? "quiz-correct" : "quiz-review"} role="status"><strong>{choice === question.answer ? "Correct." : "Review this pattern."}</strong> {question.explanation}<br />Suggested answer: {question.answer}</p>}<div className="micro-quiz-actions">{!revealed ? <button className="button button-primary" type="button" disabled={!choice} onClick={() => setRevealed(true)}>Check answer</button> : <button className="button button-primary" type="button" onClick={() => { if (questionIndex === 2) { setActive(null); setRevealed(false); setSessions(getSessions()); } else { setQuestionIndex((index) => index + 1); setChoice(""); setRevealed(false); } }}>{questionIndex === 2 ? "Finish lesson" : "Next question"}</button>}</div></div>}
  </section>;
}
