"use client";

import { useEffect, useState } from "react";

type WeeklyScore = { weekStart: string; label: string; score: number | null; sampleCount: number };
type SkillTrend = {
  skillKey: string;
  mastery: number;
  confidence: number;
  evidenceCount: number;
  latestScore: number | null;
  latestAssessmentAt: string | null;
  trend: "improving" | "needs-attention" | "steady" | "building-baseline";
  changePoints: number | null;
  recentSampleCount: number;
  previousSampleCount: number;
  weeklyScores: WeeklyScore[];
};
type Insights = {
  skillTrends: SkillTrend[];
  strongestSkill: string | null;
  focusSkill: string | null;
  activeSkillsCount: number;
  assessmentsLast28Days: number;
  recurringMistakes: Array<{ category: string; occurrenceCount: number; lastSeenAt: string }>;
  evidenceWindow: string;
};

const SKILL_LABELS: Record<string, string> = {
  speaking: "Speaking",
  pronunciation: "Pronunciation",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  listening: "Listening",
  fluency: "Fluency",
  writing: "Writing",
};

const TREND_LABELS: Record<SkillTrend["trend"], string> = {
  improving: "Improving",
  "needs-attention": "Needs attention",
  steady: "Steady",
  "building-baseline": "Building baseline",
};

function skillLabel(skillKey: string) {
  return SKILL_LABELS[skillKey] ?? skillKey.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function LearningSkillTrends() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/learning/insights", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as Insights & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not load learning insights.");
        return payload;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load learning insights.");
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="section-block" aria-labelledby="learning-skill-trends-heading">
      <div className="section-heading">
        <div><p className="eyebrow">LEARNING INSIGHTS</p><h2 id="learning-skill-trends-heading">Skill trends over time</h2></div>
        <span className="section-note">Based on saved scored practice</span>
      </div>
      {error && <p className="feature-feedback" role="alert">{error}</p>}
      {!data && !error && <p aria-live="polite">Analyzing your saved skill evidence…</p>}
      {data && <>
        <div className="stats-grid">
          <article className="stat-card"><span className="stat-tag">SKILLS WITH EVIDENCE</span><div className="stat-value">{data.activeSkillsCount}</div><p>Skills with scored practice</p></article>
          <article className="stat-card"><span className="stat-tag">RECENT EVIDENCE</span><div className="stat-value">{data.assessmentsLast28Days}</div><p>Assessments in the last 28 days</p></article>
          <article className="stat-card"><span className="stat-tag">STRONGEST ESTIMATE</span><div className="stat-value" style={{ fontSize: "1.4rem" }}>{data.strongestSkill ? skillLabel(data.strongestSkill) : "Not yet available"}</div><p>Highest current mastery estimate</p></article>
          <article className="stat-card"><span className="stat-tag">NEXT FOCUS</span><div className="stat-value" style={{ fontSize: "1.4rem" }}>{data.focusSkill ? skillLabel(data.focusSkill) : "Not yet available"}</div><p>Lowest skill estimate with saved evidence</p></article>
        </div>

        {data.skillTrends.length === 0 ? (
          <div className="insights-panel"><h3>Your skill trends start with scored practice</h3><p>Complete a scored activity from your daily learning plan. As evidence accumulates, this view will show weekly scores, changes, and areas to focus on.</p><a href="/learning-plan">Open your learning plan →</a></div>
        ) : (
          <div className="analytics-grid">
            {data.skillTrends.map((skill) => (
              <article className="insights-panel" key={skill.skillKey}>
                <div className="analytics-panel-heading">
                  <div><p className="eyebrow">SKILL TREND</p><h3>{skillLabel(skill.skillKey)}</h3></div>
                  <span className="section-note">{TREND_LABELS[skill.trend]}</span>
                </div>
                <div className="streak-metrics">
                  <div><strong>{Math.round(skill.mastery * 100)}%</strong><span>Mastery estimate</span></div>
                  <div><strong>{skill.evidenceCount}</strong><span>Evidence items</span></div>
                </div>
                {skill.changePoints !== null
                  ? <p className="analytics-support">{skill.changePoints > 0 ? "+" : ""}{skill.changePoints} points vs. the previous 28 days. Based on {skill.recentSampleCount} recent and {skill.previousSampleCount} earlier assessments.</p>
                  : <p className="analytics-support">Keep practising this skill to establish a reliable trend. A change is shown after at least two assessments in each comparison period.</p>}
                <div className="week-bars" style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }} role="list" aria-label={skillLabel(skill.skillKey) + " weekly assessment scores"}>
                  {skill.weeklyScores.map((week) => <div className="week-bar-column" role="listitem" key={week.weekStart} aria-label={week.label + ": " + (week.score === null ? "no assessment" : week.score + "% average score")}>
                    <span className="week-bar-value">{week.score === null ? "" : week.score}</span>
                    <div className="week-bar-track"><div className={"week-bar-fill " + (week.score !== null ? "has-practice" : "")} style={{ height: (week.score === null ? 4 : Math.max(8, week.score)) + "%" }} /></div>
                    <span className="week-bar-label">{week.label}</span>
                  </div>)}
                </div>
                {skill.latestAssessmentAt && <p className="section-note">Latest scored activity: {new Date(skill.latestAssessmentAt).toLocaleDateString()} · Confidence {Math.round(skill.confidence * 100)}%</p>}
              </article>
            ))}
          </div>
        )}

        <section className="insights-panel" aria-labelledby="recurring-mistakes-insights">
          <div className="section-heading"><div><p className="eyebrow">REPEATED PATTERNS</p><h3 id="recurring-mistakes-insights">Areas to revisit</h3></div></div>
          {data.recurringMistakes.length
            ? <div className="activity-list">{data.recurringMistakes.map((mistake) => <article className="activity-row" key={mistake.category}><div className="activity-copy"><strong>{skillLabel(mistake.category)}</strong><span>{mistake.occurrenceCount} recorded correction patterns · last seen {new Date(mistake.lastSeenAt).toLocaleDateString()}</span></div><a href="/learning-plan">Plan practice →</a></article>)}</div>
            : <p className="analytics-support">No recurring correction patterns yet. They will appear here as scored practice records reveal repeated mistakes.</p>}
        </section>
        <p className="storage-note">Trends are calculated from saved assessment evidence, not generated by an AI guess. Scores are practice estimates, not official proficiency certification. {data.evidenceWindow}.</p>
      </>}
    </section>
  );
}
