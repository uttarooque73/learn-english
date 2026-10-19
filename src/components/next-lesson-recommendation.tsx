"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Skill = { skillKey: string; mastery: number; evidenceCount: number };
type Mistake = { category: string; occurrenceCount: number };
type ProgressPayload = { skills: Skill[]; recurringMistakes: Mistake[] };

const skillRoutes: Record<string, { label: string; href: string; reason: string }> = {
  grammar: { label: "Grammar practice", href: "/mistake-micro-lessons", reason: "Strengthen grammar with a focused micro-lesson." },
  vocabulary: { label: "Vocabulary review", href: "/daily-vocabulary", reason: "Revisit useful words and build stronger recall." },
  pronunciation: { label: "Pronunciation practice", href: "/shadowing", reason: "Practice speaking clearly and compare your attempts." },
  speaking: { label: "AI Conversation Coach", href: "/conversation-coach", reason: "Build speaking confidence with a guided conversation." },
  fluency: { label: "Fluency exercises", href: "/fluency", reason: "Work on smoother, more natural English." },
  listening: { label: "Listening practice", href: "/practice", reason: "Practice understanding English in context." },
};

function recommendationFor(data: ProgressPayload) {
  const mistake = data.recurringMistakes[0];
  if (mistake) {
    return {
      title: `Review ${mistake.category.toLocaleLowerCase()}`,
      reason: `This topic has appeared ${mistake.occurrenceCount} times in your saved feedback. A short targeted lesson can help you work on it.`,
      href: "/mistake-micro-lessons",
      cta: "Practice this skill",
    };
  }

  const weakest = [...data.skills].sort((a, b) => a.mastery - b.mastery)[0];
  if (weakest) {
    const route = skillRoutes[weakest.skillKey.toLocaleLowerCase()] ?? {
      label: "Daily learning plan",
      href: "/learning-plan",
      reason: "Follow a focused practice activity based on your learning evidence.",
    };
    return {
      title: route.label,
      reason: route.reason,
      href: route.href,
      cta: "Start recommended lesson",
    };
  }

  return {
    title: "Build your learning baseline",
    reason: "Complete a short practice session so SpeakUp can identify your strengths and suggest what to work on next.",
    href: "/practice",
    cta: "Start a practice session",
  };
}

export function NextLessonRecommendation() {
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/learning/progress", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Progress unavailable");
        return await response.json() as ProgressPayload;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const recommendation = data ? recommendationFor(data) : {
    title: "Your next small step",
    reason: failed
      ? "Your saved learning insights could not be loaded. You can still choose a practice activity."
      : "Checking your saved learning evidence to find a useful next step.",
    href: "/learning-plan",
    cta: "Open learning plan",
  };

  return (
    <section className="insights-panel" aria-labelledby="next-lesson-heading">
      <div className="section-heading">
        <div><p className="eyebrow">RECOMMENDED NEXT STEP</p><h2 id="next-lesson-heading">{recommendation.title}</h2></div>
        <span className="stat-icon lavender" aria-hidden="true">↗</span>
      </div>
      <p className="analytics-support">{recommendation.reason}</p>
      <Link className="button button-dark" href={recommendation.href}>{recommendation.cta} <span>→</span></Link>
    </section>
  );
}
