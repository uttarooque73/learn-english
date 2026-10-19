"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSessions, getVocabulary, type PracticeSession, type SavedVocabulary } from "@/lib/learning-storage";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import styles from "./weekly-learning-report.module.css";

type ReportMetrics = {
  sessions: number;
  minutes: number;
  practiceDays: number;
  vocabulary: number;
  corrections: { original: string; improved: string; count: number }[];
  strengths: string[];
  improvements: string[];
};

function getMetrics(sessions: PracticeSession[], words: SavedVocabulary[], now = new Date()): { current: ReportMetrics; previous: ReportMetrics } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const previousStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
  const currentSessions = sessions.filter((item) => {
    const time = Date.parse(item.startedAt);
    return Number.isFinite(time) && time >= start.getTime() && time <= now.getTime();
  });
  const previousSessions = sessions.filter((item) => {
    const time = Date.parse(item.startedAt);
    return Number.isFinite(time) && time >= previousStart.getTime() && time < start.getTime();
  });
  const summarize = (items: PracticeSession[], from: Date, to: Date): ReportMetrics => {
    const correctionCounts = new Map<string, { original: string; improved: string; count: number }>();
    const strengths = new Map<string, number>();
    const improvements = new Map<string, number>();
    for (const session of items) {
      for (const correction of session.summary?.corrections ?? []) {
        const original = correction.original.trim();
        const improved = correction.improved.trim();
        if (!original || !improved) continue;
        const key = original.toLocaleLowerCase() + "\u0000" + improved.toLocaleLowerCase();
        const found = correctionCounts.get(key);
        if (found) found.count += 1;
        else correctionCounts.set(key, { original, improved, count: 1 });
      }
      for (const item of session.summary?.strengths ?? []) {
        const value = item.trim();
        if (value) strengths.set(value, (strengths.get(value) ?? 0) + 1);
      }
      for (const item of session.summary?.improvements ?? []) {
        const value = item.trim();
        if (value) improvements.set(value, (improvements.get(value) ?? 0) + 1);
      }
    }
    return {
      sessions: items.length,
      minutes: Math.round(items.reduce((sum, item) => sum + Math.max(0, item.durationSeconds), 0) / 60),
      practiceDays: new Set(items.map((item) => {
        const date = new Date(item.startedAt);
        return date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate();
      })).size,
      vocabulary: words.filter((word) => {
        const time = Date.parse(word.savedAt);
        return Number.isFinite(time) && time >= from.getTime() && time <= to.getTime();
      }).length,
      corrections: [...correctionCounts.values()].sort((a, b) => b.count - a.count).slice(0, 3),
      strengths: [...strengths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([value]) => value),
      improvements: [...improvements.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([value]) => value),
    };
  };
  return {
    current: summarize(currentSessions, start, now),
    previous: summarize(previousSessions, previousStart, new Date(start.getTime() - 1)),
  };
}

function changeLabel(current: number, previous: number) {
  const difference = current - previous;
  if (difference > 0) return { text: `+${difference}`, positive: true };
  if (difference < 0) return { text: String(difference), positive: false };
  return { text: "No change", positive: false };
}

export function WeeklyLearningReport() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [words, setWords] = useState<SavedVocabulary[]>([]);
  const [ready, setReady] = useState(false);
  const [report, setReport] = useState("");
  const [reportError, setReportError] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (!active) return;
      setSessions(getSessions());
      setWords(getVocabulary());
      setReady(true);
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => getMetrics(sessions, words), [sessions, words]);
  const hasHistory = sessions.length > 0 || words.length > 0;

  async function generateReport() {
    setGenerating(true);
    setReportError("");
    setReport("");
    try {
      const prompt = [
        "Create a supportive weekly English-learning report using only the evidence below.",
        "Do not invent activity, scores, or progress. If evidence is missing, say so clearly.",
        "Include: a short weekly summary; what is going well; recurring correction patterns and their corrected versions; one or two focus areas; and three practical actions for next week.",
        "Keep it specific, encouraging, and concise. Do not claim an official proficiency level.",
        "",
        "Current 7-day metrics: " + JSON.stringify(metrics.current),
        "Previous 7-day metrics: " + JSON.stringify(metrics.previous),
        "Recent session evidence: " + JSON.stringify(sessions.filter((session) => {
          const time = Date.parse(session.startedAt);
          return Number.isFinite(time) && time >= Date.now() - 7 * 24 * 60 * 60 * 1000;
        }).slice(0, 12).map((session) => ({
          scenario: session.scenario,
          goal: session.goal,
          durationSeconds: session.durationSeconds,
          messageCount: session.messageCount,
          summary: session.summary,
        }))),
      ].join("\n");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "tutor",
          difficulty: "Intermediate",
          sessionGoal: "Improve fluency",
          feedbackStyle: "balanced",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "The AI report could not be generated. Please try again.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let output = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
        setReport(output);
      }
      output += decoder.decode();
      if (!output.trim()) throw new Error("The AI returned an empty report. Please try again.");
      setReport(output.trim());
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Could not generate your report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  if (!ready) return <section className={styles.loading} aria-live="polite">Loading your saved learning history…</section>;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>YOUR LAST 7 DAYS</span>
          <h2>Small steps. Real progress.</h2>
          <p>A weekly review built from your saved practice sessions, vocabulary, and feedback. Your report uses your actual learning history—not guessed scores.</p>
        </div>
        <div className={styles.heroMark} aria-hidden="true"><span>7</span><small>DAY REVIEW</small></div>
      </section>

      {!hasHistory && <section className={styles.empty} aria-labelledby="report-empty-title">
        <span className={styles.emptyIcon} aria-hidden="true">✦</span>
        <h3 id="report-empty-title">Your first report starts with one practice session</h3>
        <p>Practice history and saved words will appear here once you start using SpeakUp. Nothing is fabricated to fill the report.</p>
        <Link className={styles.primary} href="/practice">Start practising <span aria-hidden="true">→</span></Link>
      </section>}

      <section className={styles.metrics} aria-label="This week's learning metrics">
        {[
          { label: "Practice sessions", value: metrics.current.sessions, prior: metrics.previous.sessions, suffix: "" },
          { label: "Practice time", value: metrics.current.minutes, prior: metrics.previous.minutes, suffix: " min" },
          { label: "Practice days", value: metrics.current.practiceDays, prior: metrics.previous.practiceDays, suffix: "" },
          { label: "Words saved", value: metrics.current.vocabulary, prior: metrics.previous.vocabulary, suffix: "" },
        ].map((item) => {
          const change = changeLabel(item.value, item.prior);
          return <article className={styles.metric} key={item.label}>
            <span>{item.label}</span><strong>{item.value}{item.suffix}</strong>
            <small>{change.text} vs previous 7 days</small>
          </article>;
        })}
      </section>

      <section className={styles.columns}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>WHAT&apos;S WORKING</span><h3>Strengths to keep building</h3></div><span aria-hidden="true">↗</span></div>
          {metrics.current.strengths.length ? <ul>{metrics.current.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : <p className={styles.muted}>Strengths will appear here when your saved session summaries include feedback.</p>}
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>YOUR NEXT FOCUS</span><h3>Patterns to improve</h3></div><span aria-hidden="true">✎</span></div>
          {metrics.current.improvements.length ? <ul>{metrics.current.improvements.map((item) => <li key={item}>{item}</li>)}</ul> : <p className={styles.muted}>Complete a practice session and save its summary to identify useful focus areas.</p>}
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>REPEATED CORRECTIONS</span><h3>Make these changes feel natural</h3></div><span className={styles.count}>{metrics.current.corrections.length} patterns</span></div>
        {metrics.current.corrections.length ? <div className={styles.corrections}>{metrics.current.corrections.map((item) => <div className={styles.correction} key={item.original + item.improved}><span>{item.original}</span><span aria-hidden="true">→</span><strong>{item.improved}</strong><small>{item.count} occurrence{item.count === 1 ? "" : "s"}</small></div>)}</div> : <p className={styles.muted}>No saved corrections in this week's sessions yet. Keep practising and review session feedback to build this section.</p>}
      </section>

      <section className={styles.aiPanel}>
        <div><span className={styles.eyebrow}>PERSONALISED COACHING</span><h3>Your AI weekly report</h3><p>Turn the saved evidence into an actionable recap and a realistic plan for next week.</p></div>
        <button className={styles.primary} type="button" onClick={generateReport} disabled={generating || !hasHistory}>{generating ? "Building your report…" : report ? "Regenerate report" : "Generate AI report"} <span aria-hidden="true">→</span></button>
      </section>
      {reportError && <p className={styles.error} role="alert">{reportError}</p>}
      {report && <section className={styles.report} aria-live="polite" aria-labelledby="generated-report-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>YOUR WEEK IN REVIEW</span><h3 id="generated-report-title">A plan shaped around you</h3></div><button type="button" className={styles.secondary} onClick={() => { void navigator.clipboard?.writeText(report).catch(() => undefined); }}>Copy report</button></div><div className={styles.reportText}>{report}</div></section>}

      <nav className={styles.nextSteps} aria-label="Continue learning"><span>KEEP YOUR MOMENTUM</span><Link href="/dashboard">Learning dashboard <span aria-hidden="true">→</span></Link><Link href="/learning-plan">Daily learning plan <span aria-hidden="true">→</span></Link><Link href="/ai-tutor">Practise with AI tutor <span aria-hidden="true">→</span></Link></nav>
    </div>
  );
}
