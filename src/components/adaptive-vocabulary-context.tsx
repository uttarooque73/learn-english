"use client";

import { useState } from "react";
import { ListenButton } from "@/components/listen-button";
import { saveVocabulary } from "@/lib/learning-storage";
import styles from "./adaptive-vocabulary-context.module.css";

type Lesson = {
  title: string; setup: string; targetPhrase: string; meaningInContext: string;
  dialogue: { speaker: string; text: string }[]; question: string; options: string[];
  answerIndex: number; explanation: string; challenge: string;
};
const scenarios = ["Everyday conversation", "Workplace discussion", "Job interview", "Travel situation", "Shopping and services", "Software development team"];
const fallback: Lesson = {
  title: "Clarifying a project deadline", setup: "Your teammate needs an update before the next planning meeting.",
  targetPhrase: "keep me posted", meaningInContext: "Tell me when there is new information or when something changes.",
  dialogue: [
    { speaker: "Maya", text: "Do you think we can finish the new dashboard by Friday?" },
    { speaker: "Arjun", text: "The main features are ready, but we still need to test it on mobile." },
    { speaker: "Maya", text: "Got it. Please keep me posted if the timeline changes." },
    { speaker: "Arjun", text: "Of course. I’ll send you an update after testing tomorrow." },
  ],
  question: "What does Maya mean by “keep me posted”?", options: ["Send her updates when there is new information", "Add her name to the project", "Finish the project without testing"], answerIndex: 0,
  explanation: "“Keep me posted” means to continue telling someone about progress or changes.", challenge: "Use “keep me posted” in a sentence about a plan you are waiting to hear about.",
};

export function AdaptiveVocabularyContext() {
  const [scenario, setScenario] = useState(scenarios[1]);
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [targetPhrase, setTargetPhrase] = useState("");
  const [lesson, setLesson] = useState<Lesson>(fallback);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [usedFallback, setUsedFallback] = useState(true);
  const [saved, setSaved] = useState(false);

  async function generate() {
    setLoading(true); setError(""); setNotice(""); setSelected(null); setChecked(false); setSaved(false);
    try {
      const response = await fetch("/api/vocabulary/context", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, level, targetPhrase }),
      });
      const data = await response.json() as { lesson?: Lesson; error?: string };
      if (!response.ok || !data.lesson) throw new Error(data.error || "Could not generate a lesson.");
      setLesson(data.lesson); setUsedFallback(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate a lesson.");
    } finally { setLoading(false); }
  }

  function savePhrase() {
    try {
      saveVocabulary({
        phrase: lesson.targetPhrase, meaning: lesson.meaningInContext,
        example: lesson.dialogue.find((line) => line.text.toLowerCase().includes(lesson.targetPhrase.toLowerCase()))?.text || lesson.challenge,
        category: "expression", sourceExamples: lesson.dialogue.map((line) => line.text).slice(0, 5), sourceScenario: scenario,
      });
      setSaved(true); setNotice("Saved to your vocabulary word bank.");
    } catch { setNotice("Could not save this phrase. Please try again."); }
  }

  const scoreCorrect = checked && selected === lesson.answerIndex;
  return <div className={styles.page}>
    <section className={styles.hero}>
      <div><span className={styles.kicker}>LEARN IT IN REAL LIFE</span><h2>Words make sense<br /><em>in context.</em></h2><p>Practise useful English in short dialogues tailored to your level. Understand how a phrase works, answer a quick question, then use it yourself.</p></div>
      <div className={styles.heroMark} aria-hidden="true"><span>“</span><strong>Aa</strong><small>NOTICE · UNDERSTAND · USE</small></div>
    </section>

    <section className={styles.builder} aria-labelledby="lesson-builder">
      <div className={styles.sectionHead}><div><span className={styles.kicker}>PERSONALISE YOUR PRACTICE</span><h3 id="lesson-builder">Build a context lesson</h3></div><span className={styles.pill}>AI-powered</span></div>
      <div className={styles.controls}>
        <label>Situation<select value={scenario} onChange={(e) => setScenario(e.target.value)}>{scenarios.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>English level<select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
        <label className={styles.phraseInput}>Target word or phrase <span className={styles.optional}>Optional</span><input value={targetPhrase} maxLength={100} onChange={(e) => setTargetPhrase(e.target.value)} placeholder="e.g. keep me posted" /></label>
      </div>
      <button className={styles.primary} type="button" disabled={loading} onClick={() => void generate()}>{loading ? "Creating your dialogue…" : "Generate adaptive dialogue"} <span aria-hidden="true">→</span></button>
      {error && <p className={styles.error} role="alert">{error} The starter lesson remains available while you check the AI service.</p>}
    </section>

    <section className={styles.lesson} aria-labelledby="active-lesson">
      <div className={styles.lessonHead}><div><span className={styles.kicker}>{usedFallback ? "STARTER LESSON" : scenario.toUpperCase()} · {level.toUpperCase()}</span><h3 id="active-lesson">{lesson.title}</h3><p>{lesson.setup}</p></div><span className={styles.contextIcon} aria-hidden="true">✦</span></div>
      <div className={styles.dialogue}>
        {lesson.dialogue.map((line, index) => <div className={styles.turn} key={index}><span className={styles.speaker}>{line.speaker}</span><div className={styles.bubble}><p>{line.text}</p><ListenButton text={line.text} label={`Listen to ${line.speaker}'s line ${index + 1}`} /></div></div>)}
      </div>
      <div className={styles.wordFocus}><div className={styles.wordTop}><span className={styles.kicker}>PHRASE IN CONTEXT</span><ListenButton text={lesson.targetPhrase} label="Listen to target phrase" /></div><h4>{lesson.targetPhrase}</h4><p>{lesson.meaningInContext}</p><button className={styles.saveButton} type="button" onClick={savePhrase} disabled={saved}>{saved ? "✓ Saved to my vocabulary" : "+ Save phrase to my vocabulary"}</button></div>
      <div className={styles.quiz}>
        <div className={styles.sectionHead}><div><span className={styles.kicker}>CHECK YOUR UNDERSTANDING</span><h3>{lesson.question}</h3></div><span className={styles.quizCount}>01 / 01</span></div>
        <div className={styles.options}>{lesson.options.map((option, index) => <button key={option} type="button" className={`${styles.option} ${selected === index ? styles.optionSelected : ""} ${checked && index === lesson.answerIndex ? styles.optionCorrect : ""} ${checked && selected === index && index !== lesson.answerIndex ? styles.optionWrong : ""}`} disabled={checked} aria-pressed={selected === index} onClick={() => setSelected(index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>
        {!checked ? <button className={styles.primary} type="button" disabled={selected === null} onClick={() => setChecked(true)}>Check answer <span aria-hidden="true">→</span></button> : <div className={styles.feedback} role="status"><strong>{scoreCorrect ? "Exactly right!" : "Let’s learn from it."}</strong><p>{lesson.explanation}</p><div className={styles.challenge}><span className={styles.kicker}>YOUR TURN</span><p>{lesson.challenge}</p></div><button className={styles.secondary} type="button" onClick={() => { setSelected(null); setChecked(false); }}>Try this question again</button></div>}
      </div>
    </section>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <p className={styles.footnote}>AI dialogue generation uses the repository’s configured Ollama model. The starter lesson works even if the model is temporarily unavailable. Saved phrases are added to your existing vocabulary bank.</p>
  </div>;
}
