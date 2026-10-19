"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { initializeDatabasePersistence, readPersistedValue } from "@/lib/client-persistence";
import styles from "./skill-trends.module.css";

type SkillKey = "fluency" | "clarity" | "grammar" | "vocabulary" | "structure";
type SkillScore = { score: number; feedback: string };
type SavedReview = {
  id: string;
  createdAt: string;
  feedback: { overallScore: number; categories: Record<SkillKey, SkillScore> };
};
type Skill = { key: SkillKey; label: string; description: string };
const HISTORY_KEY = "speakup:speaking-feedback-history";
const SKILLS: Skill[] = [
  { key: "fluency", label: "Flow & concision", description: "How smoothly and directly you express ideas" },
  { key: "clarity", label: "Clarity", description: "How easy your answer is to follow" },
  { key: "grammar", label: "Grammar", description: "Sentence accuracy in your transcript" },
  { key: "vocabulary", label: "Vocabulary", description: "Range and fit of your word choices" },
  { key: "structure", label: "Structure", description: "How well your response is organized" },
];

function isSavedReview(value: unknown): value is SavedReview {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedReview>;
  if (typeof item.id !== "string" || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))) return false;
  if (!item.feedback || typeof item.feedback !== "object" || typeof item.feedback.overallScore !== "number"
    || !Number.isFinite(item.feedback.overallScore) || item.feedback.overallScore < 0 || item.feedback.overallScore > 100
    || !item.feedback.categories || typeof item.feedback.categories !== "object") return false;
  return SKILLS.every(({ key }) => {
    const category = item.feedback?.categories[key];
    return !!category && typeof category.score === "number" && Number.isFinite(category.score) && category.score >= 0 && category.score <= 100;
  });
}

function changeBetween(first: number, last: number) {
  const difference = last - first;
  if (difference > 0) return { text: `+${difference} pts`, direction: "up" as const };
  if (difference < 0) return { text: `${difference} pts`, direction: "down" as const };
  return { text: "No change", direction: "flat" as const };
}

export function SkillTrends() {
  const [reviews, setReviews] = useState<SavedReview[]>([]);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (!active) return;
      const saved = readPersistedValue(HISTORY_KEY);
      if (saved) {
        try {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed)) setReviews(parsed.filter(isSavedReview).slice(0, 10));
        } catch {
          setUnavailable(true);
        }
      }
      setReady(true);
    }).catch(() => {
      if (active) {
        setUnavailable(true);
        setReady(true);
      }
    });
    return () => { active = false; };
  }, []);

  const ordered = useMemo(() => [...reviews].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)), [reviews]);
  const first = ordered[0];
  const latest = ordered[ordered.length - 1];

  return (
    <section className={styles.panel} aria-labelledby="skill-trends-heading">
      <div className={styles.header}>
        <div><p className={styles.eyebrow}>ASSESSMENT EVIDENCE</p><h2 id="skill-trends-heading">Speaking skill trends</h2></div>
        {ready && reviews.length > 0 && <span className={styles.count}>{reviews.length} {reviews.length === 1 ? "review" : "reviews"}</span>}
      </div>
      <p className={styles.intro}>Track how your transcript-based speaking feedback changes across saved reviews. Scores reflect the written transcript, not acoustic pronunciation or voice quality.</p>
      {!ready ? <p className={styles.notice} role="status">Loading saved assessment evidence…</p> : unavailable ? (
        <p className={styles.notice} role="status">Saved assessment history could not be loaded. Try refreshing this page.</p>
      ) : !latest ? (
        <div className={styles.empty}><strong>No speaking trend yet</strong><p>Complete an AI Speaking Feedback review to establish your first recorded scores.</p><Link href="/speaking-feedback">Start a speaking review ↗</Link></div>
      ) : (
        <>
          <div className={styles.overall}>
            <div><span className={styles.overallLabel}>LATEST OVERALL SCORE</span><strong>{latest.feedback.overallScore}<small>/100</small></strong></div>
            {first && latest !== first ? <div className={styles.changeBlock}><span className={styles.overallLabel}>CHANGE SINCE FIRST REVIEW</span><strong className={styles[changeBetween(first.feedback.overallScore, latest.feedback.overallScore).direction]}>{changeBetween(first.feedback.overallScore, latest.feedback.overallScore).text}</strong></div> : <p className={styles.firstNote}>This is your baseline. Complete another review to see a change over time.</p>}
          </div>
          <div className={styles.skills}>
            {SKILLS.map((skill) => {
              const currentScore = latest.feedback.categories[skill.key].score;
              const initialScore = first.feedback.categories[skill.key].score;
              const change = changeBetween(initialScore, currentScore);
              const values = ordered.map((review) => review.feedback.categories[skill.key].score);
              return <article className={styles.skill} key={skill.key}>
                <div className={styles.skillTop}><div><h3>{skill.label}</h3><p>{skill.description}</p></div><strong>{currentScore}<small>/100</small></strong></div>
                <div className={styles.track} role="img" aria-label={`${skill.label}: latest score ${currentScore} out of 100`}><span style={{ width: `${currentScore}%` }} /></div>
                <div className={styles.trendRow}>
                  {ordered.length > 1 ? <span className={styles.sparkline} role="img" aria-label={`${skill.label} scores over time: ${values.join(", ")}`}>{values.map((score, index) => <i key={ordered[index].id} title={`${new Date(ordered[index].createdAt).toLocaleDateString()}: ${score}/100`} style={{ height: `${Math.max(6, score)}%` }} />)}</span> : <span className={styles.noTrend}>One score recorded</span>}
                  {ordered.length > 1 && <span className={`${styles.change} ${styles[change.direction]}`}>{change.text}</span>}
                </div>
              </article>;
            })}
          </div>
          <p className={styles.footnote}>Comparisons use your earliest and latest valid saved reviews in this history (up to 10). A higher score is not a formal certification of English proficiency.</p>
          <Link className={styles.link} href="/speaking-feedback">Complete another speaking review ↗</Link>
        </>
      )}
    </section>
  );
}
