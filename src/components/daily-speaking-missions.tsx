"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./daily-speaking-missions.module.css";

type Skill = { skillKey: string; mastery: number; confidence: number; evidenceCount: number };
type ProgressResponse = { skills?: Skill[]; recurringMistakes?: { category: string; occurrenceCount: number }[] };
type Mission = { id: string; title: string; category: string; focus: string; description: string; opening: string; middle: string; finish: string; stretch: string; duration: number; };
type Completion = { date: string; missionId: string; title: string; reflection: string; completedAt: string; };
const MISSIONS: Mission[] = [
  { id: "clear-explanation", title: "Explain a technical idea simply", category: "Work & clarity", focus: "clear explanations", description: "Explain a tool, feature, or idea to a teammate who has never used it. Aim for clarity rather than technical detail.", opening: "Name the idea and why it matters.", middle: "Explain two key points and give a concrete example.", finish: "Summarise the benefit in one sentence.", stretch: "Avoid jargon, or explain any technical term you use.", duration: 3 },
  { id: "past-story", title: "Tell a short story in the past tense", category: "Grammar & fluency", focus: "past-tense accuracy", description: "Describe a real moment when a plan changed and how you handled it. Keep the story moving instead of stopping to edit every sentence.", opening: "Set the scene: when and where did it happen?", middle: "Explain what happened next and what you did.", finish: "Share the result and what you learned.", stretch: "Use at least three past-tense verbs naturally.", duration: 2 },
  { id: "opinion", title: "Make your opinion convincing", category: "Confidence & structure", focus: "organising ideas", description: "Choose a familiar topic and state your view clearly. Support it with reasons and an example, then acknowledge another point of view.", opening: "State your opinion in one direct sentence.", middle: "Give two reasons and one real-life example.", finish: "Acknowledge the other side and restate your view.", stretch: "Use phrases like “for example” and “however”.", duration: 3 },
  { id: "meeting-update", title: "Give a concise project update", category: "Workplace English", focus: "professional speaking", description: "Imagine a teammate asks what you have been working on. Give a useful update that is brief, specific, and easy to follow.", opening: "Say what you completed.", middle: "Explain what you are working on and any blocker.", finish: "Name your next step and expected timing.", stretch: "Use “I’ve completed…”, “I’m currently…” and “Next, I’ll…”.", duration: 2 },
  { id: "describe-place", title: "Describe a place from memory", category: "Everyday fluency", focus: "descriptive vocabulary", description: "Describe a place you know well so a listener can picture it without seeing a photo.", opening: "Say where it is and why you know it.", middle: "Describe what someone can see, hear, and feel there.", finish: "Explain why the place matters to you.", stretch: "Include one comparison and at least three precise adjectives.", duration: 3 },
  { id: "interview", title: "Answer an interview question", category: "Career confidence", focus: "structured answers", description: "Practise answering “Tell me about a challenge you solved.” Give a specific example rather than a general claim.", opening: "Briefly explain the situation.", middle: "Describe the action you personally took.", finish: "Share the result and what you learned.", stretch: "Keep the answer under two minutes and quantify the result if possible.", duration: 3 },
  { id: "clarify", title: "Ask for clarification politely", category: "Conversation skills", focus: "natural phrases", description: "Imagine you did not understand a request in a meeting. Practise asking a clear follow-up without apologising repeatedly.", opening: "Say which part you want to clarify.", middle: "Ask one specific follow-up question.", finish: "Repeat your understanding to confirm.", stretch: "Try “Could you clarify…?” and “Just to confirm, do you mean…?”.", duration: 2 },
];

const STORAGE_KEY = "speakup-daily-speaking-missions-v1";
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function dailyIndex(date: string) {
  return [...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % MISSIONS.length;
}
function chooseMission(date: string, skills: Skill[], mistakes: { category: string; occurrenceCount: number }[]) {
  const lowSkill = [...skills].filter((skill) => Number.isFinite(skill.mastery)).sort((a, b) => a.mastery - b.mastery)[0];
  const weakest = `${lowSkill?.skillKey ?? ""} ${mistakes.sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0]?.category ?? ""}`.toLowerCase();
  if (/grammar|tense|verb|sentence/.test(weakest)) return MISSIONS.find((mission) => mission.id === "past-story")!;
  if (/vocab|word|expression/.test(weakest)) return MISSIONS.find((mission) => mission.id === "describe-place")!;
  if (/pronunciation|fluency|confidence/.test(weakest)) return MISSIONS.find((mission) => mission.id === "clear-explanation")!;
  if (/conversation|listening|interaction/.test(weakest)) return MISSIONS.find((mission) => mission.id === "clarify")!;
  return MISSIONS[dailyIndex(date)];
}

export function DailySpeakingMissions() {
  const [date, setDate] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mistakes, setMistakes] = useState<{ category: string; occurrenceCount: number }[]>([]);
  const [history, setHistory] = useState<Completion[]>([]);
  const [reflection, setReflection] = useState("");
  const [completed, setCompleted] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [notice, setNotice] = useState("");
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    const restoreTimeout = window.setTimeout(() => {
      const today = localDate();
      setDate(today);
      try {
        const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
        if (Array.isArray(stored)) {
          const valid = stored.filter((item): item is Completion => Boolean(item && typeof item === "object" && typeof item.date === "string" && typeof item.missionId === "string" && typeof item.title === "string" && typeof item.reflection === "string" && typeof item.completedAt === "string")).slice(-60);
          setHistory(valid);
          setCompleted(valid.some((item) => item.date === today));
        }
      } catch {
        setNotice("Your browser could not restore saved mission history. You can still practise today.");
      }
    }, 0);
    void fetch("/api/learning/progress", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Progress is unavailable");
        return await response.json() as ProgressResponse;
      })
      .then((data) => {
        setSkills(Array.isArray(data.skills) ? data.skills : []);
        setMistakes(Array.isArray(data.recurringMistakes) ? data.recurringMistakes : []);
      })
      .catch(() => setNotice((current) => current || "Using a daily mission while your learning history is unavailable."))
      .finally(() => setLoadingProgress(false));
    return () => window.clearTimeout(restoreTimeout);
  }, []);

  const mission = useMemo(() => chooseMission(date || "2026-01-01", skills, mistakes), [date, skills, mistakes]);
  const streak = useMemo(() => {
    const days = new Set(history.map((item) => item.date));
    let count = 0;
    const cursor = new Date();
    if (!days.has(localDate())) cursor.setDate(cursor.getDate() - 1);
    while (days.has(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`)) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [history]);

  function completeMission() {
    if (completed) return;
    const missionDate = date || localDate();
    const entry: Completion = { date: missionDate, missionId: mission.id, title: mission.title, reflection: reflection.trim().slice(0, 500), completedAt: new Date().toISOString() };
    const next = [...history.filter((item) => item.date !== missionDate), entry].slice(-60);
    setDate(missionDate);
    setHistory(next);
    setCompleted(true);
    setElapsed(false);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { setNotice("Mission completed for this session, but browser storage is unavailable."); }
  }

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div><span className={styles.kicker}>ONE SMALL WIN, EVERY DAY</span><h2>Speak a little.<br />Grow a lot.</h2><p>Your daily mission gives you one clear speaking goal, a simple structure to follow, and an optional stretch challenge. It uses your saved learning signals when they are available.</p></div>
      <div className={styles.heroStats}>
        <div className={styles.stat}><strong>{history.length}</strong><span>Missions completed</span></div>
        <div className={styles.stat}><strong>{streak} day{streak === 1 ? "" : "s"}</strong><span>Current practice streak</span></div>
      </div>
    </section>

    <section className={styles.card} aria-labelledby="today-mission">
      <div className={styles.sectionHead}><div><span className={styles.label}>TODAY&apos;S SPEAKING MISSION{date ? ` · ${date}` : ""}</span><h3 id="today-mission">Your next confident conversation starts here</h3></div><span className={styles.pill}>{completed ? "Completed today" : `${mission.duration} minute mission`}</span></div>
      <span className={styles.label}>{mission.category.toUpperCase()} · FOCUS: {mission.focus.toUpperCase()}</span>
      <h2 className={styles.missionTitle}>{mission.title}</h2><p className={styles.description}>{mission.description}</p>
      <div className={styles.plan}>
        <div className={styles.step}><b>01 · Open</b><p>{mission.opening}</p></div>
        <div className={styles.step}><b>02 · Develop</b><p>{mission.middle}</p></div>
        <div className={styles.step}><b>03 · Finish</b><p>{mission.finish}</p></div>
      </div>
      <p className={styles.description}><strong>Stretch goal:</strong> {mission.stretch}</p>
      <div className={styles.controls}>
        <button className={styles.primary} type="button" onClick={() => { setElapsed(true); if (typeof window !== "undefined" && "speechSynthesis" in window) { window.speechSynthesis.cancel(); } }} disabled={completed}>I practised this aloud <span aria-hidden="true">→</span></button>
        {elapsed && !completed && <span className={styles.pill} role="status">Nice work. Add a reflection to lock in today&apos;s win.</span>}
      </div>
      {elapsed && !completed && <div className={styles.controls}><label className={styles.field}>What felt easier, or what will you improve next time? <textarea value={reflection} maxLength={500} onChange={(event) => setReflection(event.target.value)} placeholder="e.g. I explained the idea clearly, but I want to slow down…" /></label><button className={styles.primary} type="button" onClick={completeMission}>Complete mission</button></div>}
      {completed && <p className={styles.feedback} role="status">Mission complete. Consistency matters more than perfection—come back tomorrow for your next challenge.</p>}
      {notice && <p className={styles.error} role="status">{notice}</p>}
      {loadingProgress && <p className={styles.empty} role="status">Checking your learning signals to personalise future missions…</p>}
    </section>

    <section className={styles.card}>
      <div className={styles.sectionHead}><div><span className={styles.label}>YOUR PRACTICE HISTORY</span><h3>Small wins add up</h3></div><span className={styles.pill}>{history.length}/60 saved</span></div>
      {history.length === 0 ? <p className={styles.empty}>Your completed missions will appear here. Try today&apos;s prompt and save a short reflection to begin your history.</p> : <div className={styles.history}>{[...history].reverse().slice(0, 7).map((item) => <div className={styles.historyRow} key={item.date}><span className={styles.historyIcon} aria-hidden="true">✓</span><div><strong>{item.title}</strong><span>{item.date}{item.reflection ? ` · “${item.reflection}”` : " · Practised aloud"}</span></div></div>)}</div>}
    </section>
  </div>;
}
