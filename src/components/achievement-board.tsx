"use client";

import { useEffect, useState } from "react";
import type { AchievementCard } from "@/lib/learning-achievements";

type Summary = {
  unlockedCount: number;
  totalCount: number;
  currentStreak: number;
  longestStreak: number;
  completedSessions: number;
  practiceMinutes: number;
};
type ResponseData = { summary?: Summary; achievements?: AchievementCard[]; error?: string };
type Category = "all" | "practice" | "consistency" | "skills" | "vocabulary";

const filters: { key: Category; label: string }[] = [
  { key: "all", label: "All milestones" },
  { key: "practice", label: "Practice" },
  { key: "consistency", label: "Consistency" },
  { key: "skills", label: "Skills" },
  { key: "vocabulary", label: "Vocabulary" },
];

export function AchievementBoard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [achievements, setAchievements] = useState<AchievementCard[]>([]);
  const [category, setCategory] = useState<Category>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/learning/achievements", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as ResponseData;
        if (!response.ok) throw new Error(data.error || "Could not load your achievements.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setSummary(data.summary ?? null);
        setAchievements(data.achievements ?? []);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load your achievements.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <section className="section-block"><p>Loading your milestones…</p></section>;
  if (error) return <section className="section-block"><p role="alert">{error}</p><button type="button" onClick={() => window.location.reload()} style={buttonStyle}>Try again</button></section>;

  const filtered = achievements.filter((achievement) => category === "all" || achievement.category === category);
  const unlocked = achievements.filter((achievement) => achievement.unlocked);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={heroStyle}>
        <div>
          <p style={{ color: "#f2ce7b", fontSize: 12, fontWeight: 800, letterSpacing: ".15em", margin: "0 0 10px" }}>EVERY STEP COUNTS</p>
          <h2 style={{ margin: 0, fontSize: "clamp(26px, 4vw, 38px)", letterSpacing: "-.035em" }}>Progress worth celebrating.</h2>
          <p style={{ maxWidth: 560, color: "#e1ece6", lineHeight: 1.65, marginBottom: 0 }}>Earn milestones from real saved practice, assessments, vocabulary reviews, and completed learning plans. No points are invented.</p>
        </div>
        <div style={scoreStyle}><strong style={{ fontSize: 42, lineHeight: 1 }}>{summary?.unlockedCount ?? unlocked.length}</strong><span style={{ fontSize: 13, color: "#e1ece6" }}>of {summary?.totalCount ?? achievements.length} unlocked</span></div>
      </section>

      <section style={summaryGridStyle} aria-label="Learning streak summary">
        <div style={summaryCardStyle}><span style={smallLabelStyle}>CURRENT STREAK</span><strong style={metricStyle}>{summary?.currentStreak ?? 0} days</strong><span style={mutedStyle}>Consecutive practice days</span></div>
        <div style={summaryCardStyle}><span style={smallLabelStyle}>LONGEST STREAK</span><strong style={metricStyle}>{summary?.longestStreak ?? 0} days</strong><span style={mutedStyle}>Your personal best</span></div>
        <div style={summaryCardStyle}><span style={smallLabelStyle}>PRACTICE SESSIONS</span><strong style={metricStyle}>{summary?.completedSessions ?? 0}</strong><span style={mutedStyle}>Completed and saved</span></div>
        <div style={summaryCardStyle}><span style={smallLabelStyle}>PRACTICE TIME</span><strong style={metricStyle}>{summary?.practiceMinutes ?? 0} min</strong><span style={mutedStyle}>Recorded practice duration</span></div>
      </section>

      <section>
        <div style={filterRowStyle} aria-label="Filter milestones">
          {filters.map((filter) => (
            <button key={filter.key} type="button" onClick={() => setCategory(filter.key)} aria-pressed={category === filter.key} style={{ ...filterStyle, ...(category === filter.key ? activeFilterStyle : {}) }}>{filter.label}</button>
          ))}
        </div>
        <div style={gridStyle}>
          {filtered.map((achievement) => (
            <article key={achievement.key} style={{ ...cardStyle, opacity: achievement.unlocked ? 1 : .88 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ ...iconStyle, background: achievement.unlocked ? "#e7f4ec" : "#f0f0ec" }} aria-hidden="true">{achievement.unlocked ? achievement.icon : "🔒"}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: 17 }}>{achievement.title}</h3>
                    {achievement.unlocked && <span style={unlockedStyle}>Unlocked</span>}
                  </div>
                  <p style={{ margin: "7px 0 16px", color: "var(--muted, #68716d)", fontSize: 13, lineHeight: 1.55 }}>{achievement.description}</p>
                </div>
              </div>
              <div style={progressMetaStyle}><span>{Math.min(achievement.value, achievement.target)} / {achievement.target} {achievement.unit}</span><strong>{achievement.progressPercent}%</strong></div>
              <div style={trackStyle} role="progressbar" aria-label={achievement.title + " progress"} aria-valuemin={0} aria-valuemax={achievement.target} aria-valuenow={Math.min(achievement.value, achievement.target)}><span style={{ width: achievement.progressPercent + "%", background: achievement.unlocked ? "#34765f" : "#c0a05a" }} /></div>
              {achievement.earnedAt && <p style={{ margin: "12px 0 0", fontSize: 12, color: "#34765f" }}>Earned {new Date(achievement.earnedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

const heroStyle: React.CSSProperties = { background: "linear-gradient(125deg, #173e36, #2c6555)", color: "#fff", borderRadius: 18, padding: "clamp(22px, 4vw, 34px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" };
const scoreStyle: React.CSSProperties = { display: "grid", gap: 6, alignContent: "center", minWidth: 110, border: "1px solid #6b9587", borderRadius: 14, padding: "18px 20px", background: "#ffffff12" };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12 };
const summaryCardStyle: React.CSSProperties = { display: "grid", gap: 8, border: "1px solid var(--line, #d8ded9)", background: "var(--surface, #fff)", borderRadius: 14, padding: 18 };
const smallLabelStyle: React.CSSProperties = { fontSize: 10, letterSpacing: ".12em", fontWeight: 800, color: "var(--muted, #68716d)" };
const metricStyle: React.CSSProperties = { fontSize: 27, letterSpacing: "-.04em" };
const mutedStyle: React.CSSProperties = { fontSize: 12, color: "var(--muted, #68716d)" };
const filterRowStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 };
const filterStyle: React.CSSProperties = { border: "1px solid var(--line, #d8ded9)", borderRadius: 999, background: "var(--surface, #fff)", padding: "9px 13px", color: "inherit", fontSize: 13, cursor: "pointer" };
const activeFilterStyle: React.CSSProperties = { background: "#245b4e", borderColor: "#245b4e", color: "#fff" };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 14 };
const cardStyle: React.CSSProperties = { border: "1px solid var(--line, #d8ded9)", background: "var(--surface, #fff)", borderRadius: 15, padding: 18, minWidth: 0 };
const iconStyle: React.CSSProperties = { width: 46, height: 46, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 13, fontSize: 23 };
const unlockedStyle: React.CSSProperties = { background: "#e7f4ec", color: "#245b4e", borderRadius: 999, padding: "4px 7px", fontSize: 10, fontWeight: 800 };
const progressMetaStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, marginBottom: 8, color: "var(--muted, #68716d)" };
const trackStyle: React.CSSProperties = { height: 7, background: "var(--line, #e3e5e0)", borderRadius: 999, overflow: "hidden" };
const buttonStyle: React.CSSProperties = { border: 0, borderRadius: 10, padding: "11px 14px", background: "#245b4e", color: "#fff", fontWeight: 750, cursor: "pointer" };
