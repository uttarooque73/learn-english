"use client";

import { useEffect, useMemo, useState } from "react";
import type { LearningCalendar, CalendarDay } from "@/lib/learning-calendar";

type CalendarResponse = LearningCalendar & { error?: string };

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function localMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function LearningActivityCalendar() {
  const [month, setMonth] = useState(localMonth);
  const [calendar, setCalendar] = useState<LearningCalendar | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch("/api/learning/calendar?month=" + encodeURIComponent(month), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as CalendarResponse;
        if (!response.ok) throw new Error(data.error || "Could not load your learning calendar.");
        return data;
      })
      .then((data) => { if (active) setCalendar(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load your learning calendar."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);

  const dayMap = useMemo(() => new Map((calendar?.days ?? []).map((day) => [day.date, day])), [calendar]);
  const selectedDay = selectedDate ? dayMap.get(selectedDate) : undefined;
  const currentMonth = localMonth();
  const oldestMonth = shiftMonth(currentMonth, -24);

  function changeMonth(nextMonth: string) {
    setMonth(nextMonth);
    setSelectedDate("");
  }

  if (error) return <section className="section-block"><p role="alert">{error}</p><button type="button" onClick={() => setMonth(month)} style={buttonStyle}>Retry</button></section>;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section style={heroStyle}>
        <div>
          <p style={{ color: "#f2ce7b", fontSize: 12, fontWeight: 800, letterSpacing: ".15em", margin: "0 0 8px" }}>YOUR LEARNING HABIT</p>
          <h2 style={{ fontSize: "clamp(25px, 4vw, 36px)", margin: 0, letterSpacing: "-.035em" }}>Consistency is progress.</h2>
          <p style={{ color: "#e1ece6", lineHeight: 1.65, marginBottom: 0 }}>Explore practice sessions, vocabulary reviews, and assessments from your saved learning history.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => changeMonth(shiftMonth(month, -1))} disabled={month <= oldestMonth} aria-label="Previous month" style={navButtonStyle}>←</button>
          <button type="button" onClick={() => changeMonth(shiftMonth(month, 1))} disabled={month >= currentMonth} aria-label="Next month" style={navButtonStyle}>→</button>
        </div>
      </section>

      <section style={summaryGridStyle} aria-label="Monthly learning summary">
        <div style={summaryCardStyle}><span style={smallLabelStyle}>ACTIVE DAYS</span><strong style={metricStyle}>{calendar?.summary.activeDays ?? "—"}</strong><span style={mutedStyle}>Days with saved activity</span></div>
        <div style={summaryCardStyle}><span style={smallLabelStyle}>PRACTICE SESSIONS</span><strong style={metricStyle}>{calendar?.summary.practiceSessions ?? "—"}</strong><span style={mutedStyle}>Completed sessions</span></div>
        <div style={summaryCardStyle}><span style={smallLabelStyle}>PRACTICE TIME</span><strong style={metricStyle}>{calendar?.summary.practiceMinutes ?? "—"} min</strong><span style={mutedStyle}>Recorded minutes</span></div>
        <div style={summaryCardStyle}><span style={smallLabelStyle}>VOCAB REVIEWS</span><strong style={metricStyle}>{calendar?.summary.vocabularyReviews ?? "—"}</strong><span style={mutedStyle}>Saved review events</span></div>
      </section>

      <section style={calendarCardStyle}>
        <div style={monthHeadingStyle}>
          <div><p className="eyebrow" style={{ marginBottom: 6 }}>ACTIVITY CALENDAR</p><h2 style={{ margin: 0 }}>{calendar?.monthLabel ?? "Loading calendar…"}</h2></div>
          {loading && <span style={mutedStyle}>Updating…</span>}
        </div>
        <div style={weekGridStyle}>
          {weekDays.map((day) => <div key={day} style={weekDayStyle}>{day}</div>)}
          {Array.from({ length: calendar?.startOffset ?? 0 }, (_, index) => <div key={"blank-" + index} aria-hidden="true" />)}
          {(calendar?.days ?? []).map((day) => (
            <CalendarDayButton key={day.date} day={day} selected={selectedDate === day.date} onSelect={() => setSelectedDate(day.date)} />
          ))}
        </div>
        <div style={legendStyle}><span>Less activity</span>{[0, 1, 2, 3, 4].map((level) => <span key={level} aria-hidden="true" style={{ ...legendSwatchStyle, background: activityColors[level] }} />)}<span>More activity</span></div>
      </section>

      <section style={detailCardStyle} aria-live="polite">
        {selectedDay ? <SelectedDay day={selectedDay} /> : <div><h3 style={{ marginTop: 0 }}>Explore a day</h3><p style={{ color: "var(--muted, #68716d)", marginBottom: 0 }}>Select any date to see its recorded practice, vocabulary reviews, and assessments.</p></div>}
      </section>

      <section style={streakRowStyle}>
        <div><span style={smallLabelStyle}>CURRENT STREAK</span><strong style={metricStyle}>{calendar?.currentStreak ?? 0} days</strong><p style={mutedStyle}>Consecutive days with practice</p></div>
        <div><span style={smallLabelStyle}>LONGEST RECORDED STREAK</span><strong style={metricStyle}>{calendar?.longestStreak ?? 0} days</strong><p style={mutedStyle}>Based on available saved history</p></div>
      </section>
    </div>
  );
}

function CalendarDayButton({ day, selected, onSelect }: { day: CalendarDay; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${day.date}: ${day.practiceSessions} practice sessions, ${day.practiceMinutes} minutes, ${day.vocabularyReviews} vocabulary reviews, ${day.assessments} assessments`} style={{ ...dayButtonStyle, background: activityColors[day.activityLevel], borderColor: selected ? "#245b4e" : "transparent", boxShadow: selected ? "inset 0 0 0 2px #245b4e" : "none" }}>
      <span>{day.dayOfMonth}</span>
      {day.totalActivities > 0 && <span style={activityDotStyle} aria-hidden="true" />}
    </button>
  );
}

function SelectedDay({ day }: { day: CalendarDay }) {
  return (
    <div>
      <p className="eyebrow" style={{ marginBottom: 6 }}>DAY DETAILS</p>
      <h3 style={{ marginTop: 0 }}>{new Date(day.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3>
      {day.totalActivities === 0 ? <p style={{ color: "var(--muted, #68716d)", marginBottom: 0 }}>No activity was recorded for this date. A rest day is fine, too.</p> : (
        <div style={detailGridStyle}>
          <div><strong>{day.practiceSessions}</strong><span>Practice sessions</span></div>
          <div><strong>{day.practiceMinutes} min</strong><span>Practice time</span></div>
          <div><strong>{day.vocabularyReviews}</strong><span>Vocabulary reviews</span></div>
          <div><strong>{day.assessments}</strong><span>Assessments</span></div>
          {day.averageAssessmentScore !== null && <div><strong>{Math.round(day.averageAssessmentScore * 100)}%</strong><span>Average assessment score</span></div>}
        </div>
      )}
    </div>
  );
}

const activityColors = ["var(--surface-muted, #f4f3ef)", "#e1eee5", "#b9d8c6", "#79b293", "#34765f"];
const heroStyle: React.CSSProperties = { background: "linear-gradient(125deg, #173e36, #2c6555)", color: "#fff", borderRadius: 18, padding: "clamp(22px, 4vw, 32px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" };
const navButtonStyle: React.CSSProperties = { width: 42, height: 42, borderRadius: 11, border: "1px solid #6b9587", background: "#ffffff12", color: "#fff", fontSize: 22, cursor: "pointer" };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12 };
const summaryCardStyle: React.CSSProperties = { display: "grid", gap: 8, border: "1px solid var(--line, #d8ded9)", background: "var(--surface, #fff)", borderRadius: 14, padding: 18 };
const smallLabelStyle: React.CSSProperties = { fontSize: 10, letterSpacing: ".12em", fontWeight: 800, color: "var(--muted, #68716d)" };
const metricStyle: React.CSSProperties = { display: "block", fontSize: 27, letterSpacing: "-.04em", marginTop: 6 };
const mutedStyle: React.CSSProperties = { fontSize: 12, color: "var(--muted, #68716d)" };
const calendarCardStyle: React.CSSProperties = { border: "1px solid var(--line, #d8ded9)", background: "var(--surface, #fff)", borderRadius: 16, padding: "clamp(16px, 3vw, 26px)" };
const monthHeadingStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 22 };
const weekGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "clamp(4px, 1vw, 10px)" };
const weekDayStyle: React.CSSProperties = { textAlign: "center", fontSize: 12, fontWeight: 750, color: "var(--muted, #68716d)", paddingBottom: 8 };
const dayButtonStyle: React.CSSProperties = { border: "2px solid transparent", borderRadius: 10, minWidth: 0, aspectRatio: "1 / 1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer", fontSize: 13, color: "var(--text, #242a29)" };
const activityDotStyle: React.CSSProperties = { width: 4, height: 4, borderRadius: 999, background: "#173e36" };
const legendStyle: React.CSSProperties = { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 18, fontSize: 11, color: "var(--muted, #68716d)" };
const legendSwatchStyle: React.CSSProperties = { width: 12, height: 12, borderRadius: 3, display: "inline-block" };
const detailCardStyle: React.CSSProperties = { border: "1px solid var(--line, #d8ded9)", background: "var(--surface, #fff)", borderRadius: 16, padding: "clamp(18px, 3vw, 26px)" };
const detailGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16 };
const streakRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, border: "1px solid var(--line, #d8ded9)", borderRadius: 15, padding: 20, background: "var(--surface, #fff)" };
const buttonStyle: React.CSSProperties = { border: 0, borderRadius: 10, padding: "11px 14px", background: "#245b4e", color: "#fff", fontWeight: 750, cursor: "pointer" };
