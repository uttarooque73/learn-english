"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Skill = { skillKey: string; mastery: number; evidenceCount: number };
type Mistake = { category: string; occurrenceCount: number };
type ProgressPayload = { skills: Skill[]; recurringMistakes: Mistake[] };
type FeedbackAction = "helpful" | "not_for_me";
type FeedbackItem = {
  recommendationId: string;
  title: string;
  action: FeedbackAction;
  createdAt: string;
};
type Recommendation = { id: string; title: string; reason: string; href: string; cta: string };

const skillRoutes: Record<string, { label: string; href: string; reason: string }> = {
  grammar: { label: "Grammar practice", href: "/mistake-micro-lessons", reason: "Strengthen grammar with a focused micro-lesson." },
  vocabulary: { label: "Vocabulary review", href: "/daily-vocabulary", reason: "Revisit useful words and build stronger recall." },
  pronunciation: { label: "Pronunciation practice", href: "/shadowing", reason: "Practice speaking clearly and compare your attempts." },
  speaking: { label: "AI Conversation Coach", href: "/conversation-coach", reason: "Build speaking confidence with a guided conversation." },
  fluency: { label: "Fluency exercises", href: "/fluency", reason: "Work on smoother, more natural English." },
  listening: { label: "Listening practice", href: "/practice", reason: "Practice understanding English in context." },
};

const feedbackWindowMs = 30 * 24 * 60 * 60 * 1000;

function recommendationsFor(data: ProgressPayload, feedback: FeedbackItem[]): Recommendation[] {
  const now = Date.now();
  const dismissed = new Set(feedback
    .filter((item) => item.action === "not_for_me" && now - Date.parse(item.createdAt) < feedbackWindowMs)
    .map((item) => item.recommendationId));
  const candidates: Recommendation[] = [];

  for (const mistake of data.recurringMistakes) {
    const id = `mistake:${mistake.category.trim().toLocaleLowerCase()}`;
    if (!mistake.category.trim() || dismissed.has(id)) continue;
    candidates.push({
      id,
      title: `Review ${mistake.category.toLocaleLowerCase()}`,
      reason: `This topic has appeared ${mistake.occurrenceCount} times in your saved feedback. A short targeted lesson can help you work on it.`,
      href: "/mistake-micro-lessons",
      cta: "Practice this skill",
    });
  }

  for (const skill of [...data.skills].filter((item) => item.evidenceCount > 0).sort((a, b) => a.mastery - b.mastery)) {
    const id = `skill:${skill.skillKey.toLocaleLowerCase()}`;
    if (dismissed.has(id)) continue;
    const route = skillRoutes[skill.skillKey.toLocaleLowerCase()] ?? {
      label: "Daily learning plan",
      href: "/learning-plan",
      reason: "Follow a focused practice activity based on your learning evidence.",
    };
    candidates.push({ id, title: route.label, reason: route.reason, href: route.href, cta: "Start recommended lesson" });
  }

  if (candidates.length > 0) return candidates;
  return [{
    id: "baseline:practice",
    title: "Build your learning baseline",
    reason: dismissed.size > 0
      ? "You have rated the current options. Try a short practice session to create fresh evidence for a different recommendation."
      : "Complete a short practice session so SpeakUp can identify your strengths and suggest what to work on next.",
    href: "/practice",
    cta: "Start a practice session",
  }];
}

export function NextLessonRecommendation() {
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [failed, setFailed] = useState(false);
  const [feedbackAvailable, setFeedbackAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/learning/progress", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Progress unavailable");
        return await response.json() as ProgressPayload;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch(() => { if (active) setFailed(true); });
    void fetch("/api/learning/recommendation-feedback", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Feedback unavailable");
        return await response.json() as { feedback?: FeedbackItem[] };
      })
      .then((payload) => { if (active && Array.isArray(payload.feedback)) setFeedback(payload.feedback); })
      .catch(() => { if (active) setFeedbackAvailable(false); });
    return () => { active = false; };
  }, []);

  const recommendation = useMemo(() => data ? recommendationsFor(data, feedback)[0] : {
    id: "loading",
    title: "Your next small step",
    reason: failed
      ? "Your saved learning insights could not be loaded. You can still choose a practice activity."
      : "Checking your saved learning evidence to find a useful next step.",
    href: "/learning-plan",
    cta: "Open learning plan",
  }, [data, feedback, failed]);
  const latestFeedback = [...feedback].reverse().find((item) => item.recommendationId === recommendation.id);
  const alreadyRated = latestFeedback?.action === "helpful";

  async function submitFeedback(action: FeedbackAction) {
    if (saving || !feedbackAvailable || recommendation.id === "loading") return;
    setSaving(true);
    setFeedbackMessage("");
    try {
      const response = await fetch("/api/learning/recommendation-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          recommendationId: recommendation.id,
          title: recommendation.title,
          action,
        }),
      });
      const payload = await response.json() as { feedback?: FeedbackItem[]; error?: string };
      if (!response.ok || !Array.isArray(payload.feedback)) throw new Error(payload.error || "Feedback could not be saved.");
      setFeedback(payload.feedback);
      setFeedbackMessage(action === "helpful" ? "Thanks — we’ll keep this preference in mind." : "Got it — we’ll avoid this recommendation for the next 30 days.");
    } catch {
      setFeedbackMessage("Your feedback could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="insights-panel" aria-labelledby="next-lesson-heading">
      <div className="section-heading">
        <div><p className="eyebrow">RECOMMENDED NEXT STEP</p><h2 id="next-lesson-heading">{recommendation.title}</h2></div>
        <span className="stat-icon lavender" aria-hidden="true">↗</span>
      </div>
      <p className="analytics-support">{recommendation.reason}</p>
      <Link className="button button-dark" href={recommendation.href}>{recommendation.cta} <span>→</span></Link>
      {data && recommendation.id !== "baseline:practice" && recommendation.id !== "loading" && (
        <div className="recommendation-feedback" aria-label="Recommendation feedback">
          {alreadyRated ? (
            <p className="recommendation-feedback-message" role="status">Thanks for rating this recommendation.</p>
          ) : (
            <>
              <span>Was this suggestion useful?</span>
              <div className="recommendation-feedback-actions">
                <button type="button" disabled={saving || !feedbackAvailable} onClick={() => void submitFeedback("helpful")}>Yes, helpful</button>
                <button type="button" disabled={saving || !feedbackAvailable} onClick={() => void submitFeedback("not_for_me")}>Not for me</button>
              </div>
            </>
          )}
          {feedbackMessage && <p className="recommendation-feedback-message" role="status">{feedbackMessage}</p>}
          {!feedbackAvailable && <p className="recommendation-feedback-message">Feedback saving is temporarily unavailable.</p>}
        </div>
      )}
    </section>
  );
}
