"use client";

import { useState } from "react";
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

    {assessment && <section className={styles.card} aria-live="polite">
      <div className={styles.head}><div><span className={styles.label}>YOUR COACH'S REVIEW</span><h3>Progress, not perfection</h3></div><span className={styles.label}>{assessment.metrics.wordCount} WORDS</span></div>
      <p className={styles.summary}>{assessment.feedback.summary}</p>
      <div className={styles.metrics}>{labels.map(({ key, label }) => { const item = assessment.feedback.categories[key]; return <div className={styles.metric} key={key}><div className={styles.metricTop}><span>{label}</span><strong>{item.score}</strong></div><div className={styles.track} aria-label={`${label} score ${item.score} out of 100`}><div className={styles.bar} style={{ width: `${item.score}%` }} /></div><p>{item.feedback}</p></div>; })}</div>
      <div className={styles.columns}><div><h4 className={styles.listTitle}>What you did well</h4><ul className={styles.list}>{assessment.feedback.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><h4 className={styles.listTitle}>Try this next</h4><ul className={styles.list}>{assessment.feedback.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul></div></div>
      <div className={styles.practice}><strong>Your next speaking challenge</strong><p>{assessment.feedback.practicePrompt}</p></div>
      <div className={styles.transcript}><strong>Transcript reviewed</strong>{"\n"}{transcript.trim()}</div>
    </section>}
  </div>;
}
