"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LearningHistoryItem, LearningHistoryKind } from "@/lib/learning-history";

type HistoryResponse = { items?: LearningHistoryItem[]; error?: string };
type KindFilter = "all" | LearningHistoryKind;
type TimeFilter = "all" | "7" | "30" | "90";

const kindOptions: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "practice", label: "Practice" },
  { value: "assessment", label: "Assessments" },
  { value: "vocabulary", label: "Vocabulary" },
];
const timeOptions: { value: TimeFilter; label: string }[] = [
  { value: "all", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export function LearningHistory() {
  const [items, setItems] = useState<LearningHistoryItem[]>([]);
  const [kind, setKind] = useState<KindFilter>("all");
  const [time, setTime] = useState<TimeFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/learning/history", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as HistoryResponse;
        if (!response.ok) throw new Error(data.error || "Could not load learning history.");
        return data;
      })
      .then((data) => { if (active) setItems(data.items ?? []); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load learning history."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const cutoff = time === "all" ? 0 : Date.now() - Number(time) * 24 * 60 * 60 * 1000;
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (kind !== "all" && item.kind !== kind) return false;
      if (cutoff && Date.parse(item.occurredAt) < cutoff) return false;
      if (needle && ![item.title, item.description, ...item.details].join(" ").toLocaleLowerCase().includes(needle)) return false;
      return true;
    });
  }, [items, kind, time, query]);

  const counts = useMemo(() => ({
    practice: items.filter((item) => item.kind === "practice").length,
    assessment: items.filter((item) => item.kind === "assessment").length,
    vocabulary: items.filter((item) => item.kind === "vocabulary").length,
  }), [items]);

  function resetFilters() {
    setKind("all");
    setTime("all");
    setQuery("");
    setVisibleCount(20);
  }

  if (loading) return <section className="section-block"><p>Loading your saved learning history…</p></section>;
  if (error) return <section className="section-block"><p role="alert">{error}</p><button type="button" onClick={() => { setLoading(true); setError(""); setRefreshKey((value) => value + 1); }} style={buttonStyle}>Retry</button></section>;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section style={heroStyle}>
        <div><p style={{ color: "#f2ce7b", fontSize: 12, fontWeight: 800, letterSpacing: ".15em", margin: "0 0 8px" }}>YOUR LEARNING JOURNAL</p><h2 style={{ fontSize: "clamp(25px, 4vw, 36px)", margin: 0, letterSpacing: "-.035em" }}>Every session leaves a trace.</h2><p style={{ color: "#e1ece6", lineHeight: 1.65, marginBottom: 0 }}>Revisit saved practice, assessments, and vocabulary reviews. Open an entry to review feedback and continue practicing.</p></div>
        <Link href="/practice" style={heroLinkStyle}>Continue practicing ↗</Link>
      </section>

      <section style={summaryGridStyle} aria-label="History summary">
        <div style={summaryCardStyle}><span style={smallLabelStyle}>PRACTICE</span><strong style={metricStyle}>{counts.practice}</strong><span style={mutedStyle}>Recent saved sessions</span></div>
        <div style={summaryCardStyle}><span style={smallLabelStyle}>ASSESSMENTS</span><strong style={metricStyle}>{counts.assessment}</strong><span style={mutedStyle}>Saved skill results</span></div>
        <div style={summaryCardStyle}><span style={smallLabelStyle}>VOCABULARY</span><strong style={metricStyle}>{counts.vocabulary}</strong><span style={mutedStyle}>Review events</span></div>
      </section>

      <section style={filtersCardStyle} aria-label="Filter learning history">
        <div style={filtersGridStyle}>
          <label style={labelStyle}>Activity type<select style={inputStyle} value={kind} onChange={(event) => { setKind(event.target.value as KindFilter); setVisibleCount(20); }}>{kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label style={labelStyle}>Date range<select style={inputStyle} value={time} onChange={(event) => { setTime(event.target.value as TimeFilter); setVisibleCount(20); }}>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label style={labelStyle}>Search history<input style={inputStyle} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(20); }} placeholder="Search topics or feedback" /></label>
        </div>
        <div style={filterFooterStyle}><span style={mutedStyle}>Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} matching entries</span><button type="button" onClick={resetFilters} style={resetButtonStyle}>Clear filters</button></div>
      </section>

      {filtered.length === 0 ? <section style={emptyStyle}><span style={{ fontSize: 30 }} aria-hidden="true">◷</span><h3>No matching activity</h3><p style={mutedStyle}>{items.length ? "Try changing your filters or search terms." : "When you save practice, assessments, and vocabulary reviews, they will appear here."}</p></section> : (
        <section style={{ display: "grid", gap: 12 }} aria-label="Saved learning entries">
          {filtered.slice(0, visibleCount).map((item) => {
            const isExpanded = expanded.has(item.id);
            return (
              <article key={item.id} style={entryStyle}>
                <div style={entryTopStyle}>
                  <div style={{ ...kindIconStyle, background: kindBackground[item.kind] }} aria-hidden="true">{kindIcon[item.kind]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={titleRowStyle}><h3 style={{ margin: 0, fontSize: 17 }}>{item.title}</h3><span style={{ ...kindBadgeStyle, background: kindBackground[item.kind] }}>{item.kind}</span></div>
                    <p style={{ margin: "7px 0", color: "var(--muted, #68716d)", fontSize: 13, lineHeight: 1.55 }}>{item.description}</p>
                    <div style={metaRowStyle}><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>{item.durationMinutes !== undefined && <span>{item.durationMinutes} min</span>}{item.scorePercent !== undefined && <strong>{item.scorePercent}%</strong>}</div>
                  </div>
                  <button type="button" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} aria-expanded={isExpanded} aria-label={(isExpanded ? "Hide details for " : "Show details for ") + item.title} style={expandButtonStyle}>{isExpanded ? "−" : "+"}</button>
                </div>
                {isExpanded && <div style={detailsStyle}>{item.details.length ? <ul style={{ margin: 0, paddingLeft: 20 }}>{item.details.map((detail, index) => <li key={index} style={{ marginBottom: 7, lineHeight: 1.55 }}>{detail}</li>)}</ul> : <p style={mutedStyle}>No additional feedback was saved for this entry.</p>}<Link href={item.href} style={continueLinkStyle}>Practice this skill again →</Link></div>}
              </article>
            );
          })}
          {filtered.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + 20)} style={loadMoreStyle}>Load 20 more entries</button>}
        </section>
      )}
    </div>
  );
}

const heroStyle: React.CSSProperties = { background: "linear-gradient(125deg, #173e36, #2c6555)", color: "#fff", borderRadius: 18, padding: "clamp(22px, 4vw, 32px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" };
const heroLinkStyle: React.CSSProperties = { background: "#f2ce7b", color: "#173e36", textDecoration: "none", padding: "12px 15px", borderRadius: 10, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12 };
const summaryCardStyle: React.CSSProperties = { display: "grid", gap: 8, border: "1px solid var(--line, #d8ded9)", background: "var(--surface, #fff)", borderRadius: 14, padding: 18 };
const smallLabelStyle: React.CSSProperties = { fontSize: 10, letterSpacing: ".12em", fontWeight: 800, color: "var(--muted, #68716d)" };
const metricStyle: React.CSSProperties = { fontSize: 27, letterSpacing: "-.04em" };
const mutedStyle: React.CSSProperties = { fontSize: 12, color: "var(--muted, #68716d)" };
const filtersCardStyle: React.CSSProperties = { border: "1px solid var(--line, #d8ded9)", background: "var(--surface, #fff)", borderRadius: 14, padding: 18 };
const filtersGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 };
const labelStyle: React.CSSProperties = { display: "grid", gap: 7, fontSize: 13, fontWeight: 700 };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid var(--line, #d8ded9)", borderRadius: 9, padding: "11px 12px", background: "var(--surface, #fff)", color: "inherit", fontSize: 14 };
const filterFooterStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" };
const resetButtonStyle: React.CSSProperties = { border: "1px solid var(--line, #d8ded9)", borderRadius: 8, background: "transparent", padding: "7px 10px", cursor: "pointer", fontSize: 12 };
const emptyStyle: React.CSSProperties = { textAlign: "center", border: "1px dashed var(--line, #d8ded9)", borderRadius: 15, padding: 36 };
const entryStyle: React.CSSProperties = { border: "1px solid var(--line, #d8ded9)", background: "var(--surface, #fff)", borderRadius: 14, padding: "clamp(14px, 2.5vw, 20px)" };
const entryTopStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 13 };
const kindIconStyle: React.CSSProperties = { width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 19 };
const titleRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const kindBadgeStyle: React.CSSProperties = { borderRadius: 999, padding: "4px 7px", fontSize: 10, textTransform: "capitalize", fontWeight: 800 };
const metaRowStyle: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 11, color: "var(--muted, #68716d)" };
const expandButtonStyle: React.CSSProperties = { width: 32, height: 32, flexShrink: 0, border: "1px solid var(--line, #d8ded9)", borderRadius: 9, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 18 };
const detailsStyle: React.CSSProperties = { borderTop: "1px solid var(--line, #d8ded9)", marginTop: 16, paddingTop: 16, paddingLeft: 55 };
const continueLinkStyle: React.CSSProperties = { display: "inline-block", marginTop: 12, color: "#34765f", fontSize: 13, fontWeight: 750, textDecoration: "none" };
const loadMoreStyle: React.CSSProperties = { border: "1px solid var(--line, #d8ded9)", borderRadius: 10, padding: 12, background: "var(--surface, #fff)", cursor: "pointer", color: "inherit", fontWeight: 700 };
const buttonStyle: React.CSSProperties = { border: 0, borderRadius: 10, padding: "11px 14px", background: "#245b4e", color: "#fff", fontWeight: 750, cursor: "pointer" };
const kindIcon: Record<LearningHistoryKind, string> = { practice: "◷", assessment: "✦", vocabulary: "Aa" };
const kindBackground: Record<LearningHistoryKind, string> = { practice: "#fbe8d9", assessment: "#ece6fb", vocabulary: "#e1f1e8" };
