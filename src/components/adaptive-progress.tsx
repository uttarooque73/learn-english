"use client";

import { useEffect, useState } from "react";

type Skill = { skillKey: string; mastery: number; confidence: number; evidenceCount: number; updatedAt: string };
type Plan = { id: string; localDate: string; status: string; version: number; totalMinutes: number; createdAt: string };
type Mistake = { category: string; occurrenceCount: number; lastSeenAt: string };
type Progress = { skills: Skill[]; plans: Plan[]; recurringMistakes: Mistake[]; recentAttempts: Array<{ id: string; activityType: string; createdAt: string; completedAt: string | null }> };

export function AdaptiveProgress() {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/learning/progress", { cache: "no-store" }).then(async response => {
      const payload = await response.json() as Progress & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load adaptive progress.");
      if (active) setData(payload);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load adaptive progress."); });
    return () => { active = false; };
  }, []);

  return (
    <section className="section-block" aria-labelledby="adaptive-progress-heading">
      <div className="section-heading"><div><p className="eyebrow">ADAPTIVE LEARNING</p><h2 id="adaptive-progress-heading">Skill progress and plan history</h2></div></div>
      {error && <p className="feature-feedback" role="alert">{error}</p>}
      {!data && !error && <p aria-live="polite">Loading saved skill evidence…</p>}
      {data && <>
        <div className="stats-grid">
          <article className="stat-card"><span className="stat-tag">SKILLS TRACKED</span><div className="stat-value">{data.skills.length}</div><p>Skills with saved assessment evidence</p></article>
          <article className="stat-card"><span className="stat-tag">RECENT ATTEMPTS</span><div className="stat-value">{data.recentAttempts.length}</div><p>Latest saved practice attempts</p></article>
          <article className="stat-card"><span className="stat-tag">PLANS SAVED</span><div className="stat-value">{data.plans.length}</div><p>Recent daily plan versions</p></article>
        </div>
        <div className="stats-grid">
          <article className="stat-card"><h3>Skill estimates</h3>
            {data.skills.length === 0 ? <p>Complete a practice activity to begin building evidence-based skill estimates.</p> : data.skills.map(skill => <div key={skill.skillKey} style={{ margin: "1rem 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}><strong>{skill.skillKey}</strong><span>{Math.round(skill.mastery * 100)}% · {skill.evidenceCount} evidence items</span></div>
              <div role="progressbar" aria-label={skill.skillKey + " mastery estimate"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(skill.mastery * 100)} style={{ height: 8, background: "var(--border, #e5e7eb)", borderRadius: 8, overflow: "hidden", marginTop: 6 }}><div style={{ width: Math.max(0, Math.min(100, skill.mastery * 100)) + "%", height: "100%", background: "var(--accent, #6d5bd0)" }} /></div>
              <p className="section-note">Confidence: {Math.round(skill.confidence * 100)}% · Updated {new Date(skill.updatedAt).toLocaleDateString()}</p>
            </div>)}
          </article>
          <article className="stat-card"><h3>Recurring mistakes</h3>
            {data.recurringMistakes.length === 0 ? <p>No recurring mistakes have been recorded yet. Saved practice evidence will appear here when available.</p> : <ul>{data.recurringMistakes.map((mistake, index) => <li key={`${mistake.category}-${index}`}><strong>{mistake.category}</strong> — {mistake.occurrenceCount} occurrences <span className="section-note">(last seen {new Date(mistake.lastSeenAt).toLocaleDateString()})</span></li>)}</ul>}
          </article>
        </div>
        <article className="stat-card"><h3>Recent learning plans</h3>
          {data.plans.length === 0 ? <p>No plans have been saved yet. <a href="/learning-plan">Create your first plan</a>.</p> : <div style={{ overflowX: "auto" }}><table><thead><tr><th>Date</th><th>Status</th><th>Version</th><th>Minutes</th></tr></thead><tbody>{data.plans.map(plan => <tr key={plan.id}><td>{plan.localDate}</td><td>{plan.status}</td><td>{plan.version}</td><td>{plan.totalMinutes}</td></tr>)}</tbody></table></div>}
        </article>
      </>}
    </section>
  );
}
