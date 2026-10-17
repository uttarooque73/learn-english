"use client";

import { useEffect, useMemo, useState } from "react";
import { getSessions, type PracticeSession } from "@/lib/learning-storage";
import { initializeDatabasePersistence, readPersistedValue, writePersistedValue } from "@/lib/client-persistence";
import { submitLearningEvidence } from "@/lib/learning-evidence-client";

type Weakness = { original: string; improved: string; reason: string; count: number; scenario: string };
type QuizQuestion = { prompt: string; options: string[]; answer: string; explanation: string };
type LessonResult = { id: string; original: string; improved: string; score: number; total: number; completedAt: string };
const RESULTS_KEY = "speakup:micro-lesson-results:v1";

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
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<LessonResult[]>([]);
  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (active) {
        setSessions(getSessions());
        const raw = readPersistedValue(RESULTS_KEY);
        if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed)) setResults(parsed.filter((item): item is LessonResult => item && typeof item.id === "string" && typeof item.score === "number" && typeof item.total === "number"));
          } catch { /* Ignore malformed history and keep an empty list. */ }
        }
      }
    }).catch(() => {
      if (active) setError("Could not load saved practice history. Refresh the page to retry.");
    });
    return () => { active = false; };
  }, []);
  const weaknesses = useMemo(() => {
    const base = collectWeaknesses(sessions);
    const averageFor = (weakness: Weakness) => {
      const matching = results.filter((result) => result.original.toLowerCase() === weakness.original.toLowerCase() && result.improved.toLowerCase() === weakness.improved.toLowerCase());
      if (!matching.length) return null;
      return matching.reduce((sum, result) => sum + result.score / Math.max(1, result.total), 0) / matching.length;
    };
    return base.sort((a, b) => {
      const aScore = averageFor(a);
      const bScore = averageFor(b);
      if (aScore !== null && bScore !== null && aScore !== bScore) return aScore - bScore;
      if (aScore !== null && bScore === null) return -1;
      if (aScore === null && bScore !== null) return 1;
      return b.count - a.count;
    });
  }, [sessions, results]);
  const question = questions[questionIndex];

  async function startLesson(weakness: Weakness) {
    setActive(weakness); setQuestions([]); setQuestionIndex(0); setChoice(""); setRevealed(false); setError(""); setScore(0); setLoading(true);
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
    <div className="learning-feature-heading"><div><p className="eyebrow">LEARN FROM YOUR HISTORY</p><h2>Micro-lessons from recurring mistakes</h2><p>Repeated corrections from separate saved sessions are sent to your AI tutor to generate three different practice questions targeting that exact weakness.</p>{results.length > 0 && <p className="analytics-support">Completed lessons: {results.length} · Average score: {Math.round(results.reduce((sum, item) => sum + (item.score / Math.max(1, item.total)) * 100, 0) / results.length)}%</p>}</div><span className="feature-symbol" aria-hidden="true">✎</span></div>
    {error && !active ? <p className="feature-feedback" role="alert">{error}</p> : !weaknesses.length ? <div className="feature-empty"><strong>No recurring pattern yet</strong><p>Complete and save session summaries with corrections. A lesson appears when the same original-to-improved correction is recorded in at least two separate session summaries.</p></div> : !active ? <div className="micro-lesson-list">{weaknesses.map((weakness) => { const matching = results.filter((result) => result.original.toLowerCase() === weakness.original.toLowerCase() && result.improved.toLowerCase() === weakness.improved.toLowerCase()); const average = matching.length ? Math.round(matching.reduce((sum, result) => sum + (result.score / Math.max(1, result.total)) * 100, 0) / matching.length) : null; return <article key={weakness.original + weakness.improved} className="micro-lesson-item"><div><strong>{weakness.original} <span aria-hidden="true">→</span> {weakness.improved}</strong><p>{weakness.reason}</p><small>Seen in {weakness.count} session summaries · e.g. {weakness.scenario}{average !== null ? ` · Your average: ${average}%` : ""}</small>{average !== null && average < 70 && <p className="quiz-review">Needs more practice — this lesson is prioritized based on your previous scores.</p>}</div><button type="button" className="button button-outline" disabled={loading} onClick={() => void startLesson(weakness)}>Practice again</button></article>; })}</div> : <div className="micro-quiz"><div className="micro-quiz-top"><strong>{loading ? "Generating your lesson…" : question ? `Question ${questionIndex + 1} of 3` : "Targeted practice"}</strong><button className="text-link" type="button" onClick={leaveLesson}>All lessons</button></div>{loading && <p role="status">Your tutor is building varied examples around this recurring mistake…</p>}{error && <div><p className="feature-feedback" role="alert">{error}</p><button type="button" className="button button-outline" onClick={() => void startLesson(active)}>Try again</button></div>}{question && !loading && <><h3>{question.prompt}</h3><div className="micro-quiz-options">{question.options.map((option) => <button type="button" key={option} className={choice === option ? "micro-quiz-option selected" : "micro-quiz-option"} onClick={() => { if (!revealed) setChoice(option); }}>{option}</button>)}</div>{revealed && <p className={choice === question.answer ? "quiz-correct" : "quiz-review"} role="status"><strong>{choice === question.answer ? "Correct." : "Review this pattern."}</strong> {question.explanation}<br />Suggested answer: {question.answer}</p>}<div className="micro-quiz-actions">{!revealed ? <button className="button button-primary" type="button" disabled={!choice} onClick={() => { if (choice === question.answer) setScore((current) => current + 1); setRevealed(true); }}>Check answer</button> : <button className="button button-primary" type="button" onClick={() => { if (questionIndex === 2) { const result: LessonResult = { id: `${Date.now()}-${active.original}`, original: active.original, improved: active.improved, score, total: questions.length, completedAt: new Date().toISOString() }; const updated = [result, ...results].slice(0, 50); setResults(updated); writePersistedValue(RESULTS_KEY, JSON.stringify(updated)); void submitLearningEvidence({ source: "micro_lesson", activityType: "grammar", activityRef: `${active.original} → ${active.improved}`, skillKey: "grammar", responseText: `Completed a targeted micro-lesson for: ${active.original}`, durationSeconds: 0, score: score / Math.max(1, questions.length), confidence: 0.4, feedback: `${score} of ${questions.length} questions answered correctly.`, corrections: [{ original: active.original, improved: active.improved, reason: active.reason }], idempotencyKey: `micro-lesson:${result.id}` }).catch(() => undefined); leaveLesson(); setSessions(getSessions()); } else { setQuestionIndex((index) => index + 1); setChoice(""); setRevealed(false); } }}>{questionIndex === 2 ? "Finish lesson" : "Next question"}</button>}</div></>}</div>}
    <div className="micro-lesson-history"><h3>Recent lesson history</h3>{results.length === 0 ? <p>Finish a micro-lesson to start tracking your scores here.</p> : <ul>{results.slice(0, 5).map((result) => <li key={result.id}><div><strong>{result.original} <span aria-hidden="true">→</span> {result.improved}</strong><small>{new Date(result.completedAt).toLocaleDateString()}</small></div><span className={result.score / Math.max(1, result.total) >= 0.7 ? "quiz-correct" : "quiz-review"}>{result.score}/{result.total} ({Math.round(result.score / Math.max(1, result.total) * 100)}%)</span></li>)}</ul>}</div>
  </section>;
}
