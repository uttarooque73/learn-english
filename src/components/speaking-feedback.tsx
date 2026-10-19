"use client";

import { useEffect, useState } from "react";
import { initializeDatabasePersistence, readPersistedValue, writePersistedValue } from "@/lib/client-persistence";
import styles from "./speaking-feedback.module.css";

type Category = { score: number; feedback: string };
type Feedback = {
  overallScore: number;
  summary: string;
  categories: { fluency: Category; clarity: Category; grammar: Category; vocabulary: Category; structure: Category };
  strengths: string[];
  improvements: string[];
  practicePrompt: string;
};
type Assessment = { feedback: Feedback; metrics: { wordCount: number; durationSeconds: number; wordsPerMinute: number | null }; assessmentType: "transcript" };
type SavedAssessment = Assessment & { id: string; transcript: string; prompt: string; proficiency: string; createdAt: string };
const HISTORY_KEY = "speakup:speaking-feedback-history";
const HISTORY_LIMIT = 10;
const labels: { key: keyof Feedback["categories"]; label: string }[] = [
  { key: "fluency", label: "Flow & concision" }, { key: "clarity", label: "Clarity" }, { key: "grammar", label: "Grammar" }, { key: "vocabulary", label: "Vocabulary" }, { key: "structure", label: "Structure" },
];

export function SpeakingFeedback() {
  const [transcript, setTranscript] = useState("");
  const [prompt, setPrompt] = useState("");
  const [proficiency, setProficiency] = useState("Intermediate");
  const [duration, setDuration] = useState("60");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<SavedAssessment[]>([]);

  useEffect(() => {
    let active = true;
    initializeDatabasePersistence().then(() => {
      const saved = readPersistedValue(HISTORY_KEY);
      if (!saved || !active) return;
      try {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((item): item is SavedAssessment => Boolean(item && typeof item === "object"
            && typeof item.id === "string" && typeof item.createdAt === "string" && typeof item.transcript === "string"
            && item.assessmentType === "transcript" && item.feedback && typeof item.feedback.overallScore === "number"
            && item.metrics && typeof item.metrics.wordCount === "number")).slice(0, HISTORY_LIMIT);
          if (active) setHistory(valid);
        }
      } catch {
        // Ignore malformed legacy history instead of breaking the practice page.
      }
    }).catch(() => {
      if (active) setError("Saved feedback history could not be loaded. You can still assess a new response.");
    });
    return () => { active = false; };
  }, []);

  async function assess() {
    setLoading(true); setError(""); setAssessment(null);
    const durationSeconds = duration.trim() ? Number(duration) : 0;
    try {
      const response = await fetch("/api/speaking-feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, prompt, proficiency, durationSeconds }),
      });
      const payload = await response.json() as Assessment & { error?: string };
      if (!response.ok || !payload.feedback) throw new Error(payload.error || "Could not assess this response.");
      setAssessment(payload);
      const entry: SavedAssessment = {
        ...payload,
        id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        transcript: transcript.trim(), prompt: prompt.trim(), proficiency, createdAt: new Date().toISOString(),
      };
      setHistory((current) => {
        const next = [entry, ...current].slice(0, HISTORY_LIMIT);
        writePersistedValue(HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not assess this response. Please try again.");
    } finally { setLoading(false); }
  }

  return <div className={styles.page}>
    <section className={styles.intro}>
      <div><span className={styles.eyebrow}>FEEDBACK THAT HELPS YOU GROW</span><h2>Speak first. Improve one thing at a time.</h2><p>Paste a speech transcript from your practice session, or type what you said. Your configured local AI coach will review grammar, clarity, vocabulary, and how well your ideas are organized.</p></div>
      {assessment && <div className={styles.scoreRing} aria-label={`Overall score ${assessment.feedback.overallScore} out of 100`}><strong>{assessment.feedback.overallScore}</strong><span>OUT OF 100</span></div>}
    </section>

    <section className={styles.card}>
      <div className={styles.head}><div><span className={styles.label}>YOUR RESPONSE</span><h3>What did you say?</h3></div></div>
      <div className={styles.form}>
        <label className={styles.field}>Speech transcript<textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} maxLength={5000} placeholder="Example: Yesterday I explained our new feature to my teammate. First, I described the problem, then I showed how the solution works…" required /></label>
        <div className={styles.fields}>
          <label className={styles.field}>Your current level<select value={proficiency} onChange={(event) => setProficiency(event.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
          <label className={styles.field}>Speaking time in seconds (optional)<input type="number" min="0" max="3600" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
        </div>
        <label className={styles.field}>What were you trying to answer? (optional)<input value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={500} placeholder="e.g. Explain a technical concept to a new teammate" /></label>
        <div className={styles.actions}><button className={styles.primary} type="button" onClick={assess} disabled={loading || transcript.trim().length < 4 || (duration.trim() !== "" && (!Number.isFinite(Number(duration)) || Number(duration) < 0 || Number(duration) > 3600))}>{loading ? "Reviewing your response…" : "Assess my speaking"}</button><button className={styles.secondary} type="button" onClick={() => { setTranscript(""); setPrompt(""); setAssessment(null); setError(""); }}>Clear</button><span className={styles.note}>Transcript-based scoring; pronunciation and pauses are not measured from text.</span></div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </section>

    {history.length > 0 && <section className={styles.card} aria-label="Saved speaking feedback history">
      <div className={styles.head}><div><span className={styles.label}>YOUR PRACTICE HISTORY</span><h3>Previous speaking reviews</h3></div><span className={styles.label}>{history.length} SAVED</span></div>
      <p className={styles.summary}>Your latest {HISTORY_LIMIT} reviews are saved to your SpeakUp learning space, so you can revisit feedback after refreshing the page.</p>
      <div className={styles.historyList}>{history.map((item) => <div className={styles.historyItem} key={item.id}>
        <button className={styles.historyButton} type="button" onClick={() => { setAssessment(item); setTranscript(item.transcript); setPrompt(item.prompt); setProficiency(item.proficiency); setError(""); }}>
          <span className={styles.historyScore}>{item.feedback.overallScore}<small>/100</small></span>
          <span className={styles.historyCopy}><strong>{item.prompt || item.transcript.slice(0, 85)}{!item.prompt && item.transcript.length > 85 ? "…" : ""}</strong><small>{new Date(item.createdAt).toLocaleString()} · {item.metrics.wordCount} words · {item.proficiency}</small></span>
          <span className={styles.historyOpen}>Review ↗</span>
        </button>
      </div>)}</div>
    </section>}

    {assessment && <section className={styles.card} aria-live="polite">
      <div className={styles.head}><div><span className={styles.label}>YOUR COACH&apos;S REVIEW</span><h3>Progress, not perfection</h3></div><span className={styles.label}>{assessment.metrics.wordCount} WORDS</span></div>
      <p className={styles.summary}>{assessment.feedback.summary}</p>
      <div className={styles.metrics}>{labels.map(({ key, label }) => { const item = assessment.feedback.categories[key]; return <div className={styles.metric} key={key}><div className={styles.metricTop}><span>{label}</span><strong>{item.score}</strong></div><div className={styles.track} aria-label={`${label} score ${item.score} out of 100`}><div className={styles.bar} style={{ width: `${item.score}%` }} /></div><p>{item.feedback}</p></div>; })}</div>
      <div className={styles.columns}><div><h4 className={styles.listTitle}>What you did well</h4><ul className={styles.list}>{assessment.feedback.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><h4 className={styles.listTitle}>Try this next</h4><ul className={styles.list}>{assessment.feedback.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul></div></div>
      <div className={styles.practice}><strong>Your next speaking challenge</strong><p>{assessment.feedback.practicePrompt}</p></div>
      <div className={styles.transcript}><strong>Transcript reviewed</strong>{"\n"}{transcript.trim()}</div>
    </section>}
  </div>;
}
