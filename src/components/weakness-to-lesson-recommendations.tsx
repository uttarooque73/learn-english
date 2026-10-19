"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./weakness-to-lesson-recommendations.module.css";

type Skill = { skillKey: string; mastery: number; confidence: number; evidenceCount: number; updatedAt: string };
type Mistake = { category: string; occurrenceCount: number; lastSeenAt: string };
type Attempt = { id: string; activityType: string; resultJson: string; createdAt: string; completedAt: string | null };
type Progress = { skills: Skill[]; recentAttempts: Attempt[]; recurringMistakes: Mistake[] };
type Lesson = { key: string; title: string; reason: string; action: string; href: string; icon: string; score?: number; evidence: string };

const LESSONS: Record<string, Omit<Lesson, "score" | "evidence">> = {
  grammar: { key: "grammar", title: "Grammar in real sentences", reason: "Practise the grammar patterns your saved results show need more repetition.", action: "Improve a sentence", href: "/sentence-improver", icon: "Aa" },
  vocabulary: { key: "vocabulary", title: "Vocabulary that sticks", reason: "Build stronger word choice with short, contextual exercises and review.", action: "Practise vocabulary", href: "/adaptive-vocabulary", icon: "✦" },
  speaking: { key: "speaking", title: "Speak with more clarity", reason: "Use transcript feedback to practise structure, flow, and expressing ideas.", action: "Review speaking feedback", href: "/speaking-feedback", icon: "↗" },
};

function normaliseSkill(value: string): string {
  const key = value.toLowerCase().replace(/[^a-z]/g, "");
  if (key.includes("vocab") || key.includes("wordchoice")) return "vocabulary";
  if (key.includes("grammar") || key.includes("tense") || key.includes("sentence")) return "grammar";
  if (key.includes("speaking") || key.includes("flow") || key.includes("clarity") || key.includes("structure") || key.includes("fluency")) return "speaking";
  return "";
}

function buildRecommendations(progress: Progress): Lesson[] {
  const scores = new Map<string, Skill>();
  for (const skill of progress.skills) {
    const key = normaliseSkill(skill.skillKey);
    if (!key || !Number.isFinite(skill.mastery) || skill.mastery < 0 || skill.mastery > 100) continue;
    const previous = scores.get(key);
    if (!previous || skill.mastery < previous.mastery) scores.set(key, skill);
  }
  const mistakeCounts = new Map<string, number>();
  for (const mistake of progress.recurringMistakes) {
    const key = normaliseSkill(mistake.category);
    if (key) mistakeCounts.set(key, (mistakeCounts.get(key) ?? 0) + Math.max(0, mistake.occurrenceCount));
  }
  return (Object.keys(LESSONS) as Array<keyof typeof LESSONS>).map((key) => {
    const skill = scores.get(key);
    const mistakeCount = mistakeCounts.get(key) ?? 0;
    const evidenceCount = Math.max(0, skill?.evidenceCount ?? 0);
    const evidence = skill
      ? `Saved mastery: ${Math.round(skill.mastery)}% · ${evidenceCount} evidence item${evidenceCount === 1 ? "" : "s"}`
      : mistakeCount
        ? `${mistakeCount} saved recurring-mistake signal${mistakeCount === 1 ? "" : "s"}`
        : "No direct skill score yet";
    const score = skill?.mastery;
    return { ...LESSONS[key], score, evidence, priority: (score === undefined ? 50 : 100 - score) + mistakeCount * 4 + (key === "speaking" && progress.recentAttempts.some((item) => item.activityType.toLowerCase().includes("speaking")) ? 3 : 0) };
  }).sort((a, b) => b.priority - a.priority).map(({ priority: _priority, ...lesson }) => lesson);
}

export function WeaknessToLessonRecommendations() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/learning/progress", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Progress could not be loaded");
        return response.json() as Promise<Progress>;
      })
      .then((data) => {
        if (!active) return;
        setProgress({
          skills: Array.isArray(data.skills) ? data.skills : [],
          recentAttempts: Array.isArray(data.recentAttempts) ? data.recentAttempts : [],
          recurringMistakes: Array.isArray(data.recurringMistakes) ? data.recurringMistakes : [],
        });
        setStatus("ready");
      })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, []);

  const lessons = useMemo(() => progress ? buildRecommendations(progress) : [], [progress]);
  const hasEvidence = Boolean(progress && (progress.skills.length || progress.recurringMistakes.length || progress.recentAttempts.length));

  if (status === "loading") return <section className={styles.panel} aria-live="polite"><p>Reviewing your saved learning results…</p></section>;
  if (status === "error") return <section className={styles.panel} role="alert"><h2>Your recommendations are temporarily unavailable</h2><p>Try refreshing this page. Your saved practice data has not been changed.</p><button className="button button-primary" onClick={() => { setStatus("loading"); fetch("/api/learning/progress", { credentials: "same-origin", cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((data: Progress) => { setProgress({ skills: Array.isArray(data.skills) ? data.skills : [], recentAttempts: Array.isArray(data.recentAttempts) ? data.recentAttempts : [], recurringMistakes: Array.isArray(data.recurringMistakes) ? data.recurringMistakes : [] }); setStatus("ready"); }).catch(() => setStatus("error")); }}>Try again</button></section>;

  return (
    <div className={styles.wrap}>
      <section className={styles.intro}>
        <div><p className={styles.eyebrow}>EVIDENCE-LED PRACTICE</p><h2>A plan built around your learning gaps</h2><p>Recommendations are ranked from saved skill mastery and recurring mistakes. As you complete more assessments, this list can become more specific.</p></div>
        <div className={styles.stat}><strong>{progress?.skills.length ?? 0}</strong><span>saved skill scores</span></div>
      </section>
      {!hasEvidence && <section className={styles.empty}><span aria-hidden="true">✦</span><div><h3>Your learning picture is just getting started</h3><p>There isn't enough saved assessment evidence to identify a personal weakness yet. Start with an assessment or complete a practice activity; we won't invent scores or pretend a generic suggestion is a measured weakness.</p><Link className="button button-primary" href="/assessment">Take English assessment</Link></div></section>}
      <div className={styles.grid}>
        {lessons.map((lesson, index) => (
          <article className={styles.card} key={lesson.key}>
            <div className={styles.cardTop}><span className={styles.icon} aria-hidden="true">{lesson.icon}</span><span className={styles.rank}>{index === 0 && hasEvidence ? "TOP PRIORITY" : lesson.score === undefined ? "BUILD EVIDENCE" : "TARGETED PRACTICE"}</span></div>
            <h3>{lesson.title}</h3><p>{lesson.reason}</p>
            {lesson.score !== undefined && <div className={styles.meter} aria-label={`Saved mastery ${Math.round(lesson.score)} percent`}><span style={{ width: `${Math.max(0, Math.min(100, lesson.score))}%` }} /></div>}
            <p className={styles.evidence}>{lesson.evidence}</p>
            <Link className={styles.link} href={lesson.href}>{lesson.action} <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </div>
      <p className={styles.note}>Scores are practice signals, not an official proficiency certification. A missing score means there is not enough direct evidence for that skill yet.</p>
    </div>
  );
}
