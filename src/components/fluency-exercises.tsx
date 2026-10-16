"use client";

import { useEffect, useMemo, useState } from "react";

type Exercise = "quick" | "daily" | "minute" | "fillers";

const exercises: { id: Exercise; title: string; description: string; icon: string }[] = [
  { id: "quick", title: "Quick response", description: "Answer naturally without overthinking.", icon: "↗" },
  { id: "daily", title: "Daily speaking prompt", description: "Build a small, consistent speaking habit.", icon: "☀" },
  { id: "minute", title: "One-minute talk", description: "Keep speaking and develop your ideas.", icon: "◷" },
  { id: "fillers", title: "Filler-word awareness", description: "Notice repeated words such as “um” and “like”.", icon: "✦" },
];

const prompts: Record<Exercise, string[]> = {
  quick: [
    "What is one skill you would like to learn, and why?",
    "Describe a small thing that made your day better.",
    "What advice would you give someone starting a new job?",
    "Would you rather work alone or with a team? Explain your choice.",
  ],
  daily: [
    "Tell the story of something you learned recently.",
    "Describe a place where you feel relaxed.",
    "What is one goal you want to make progress on this week?",
    "Explain a useful app or tool you use and why you recommend it.",
    "Talk about a person who has taught you something valuable.",
    "Describe your ideal weekend.",
    "What is one change that could make your community better?",
  ],
  minute: [
    "Talk about your work or studies and what you enjoy about them.",
    "Explain a challenge you solved and what you learned from it.",
    "Describe a technology you think will change everyday life.",
    "Talk about a goal you are working toward and your next step.",
  ],
  fillers: [
    "Explain your morning routine as clearly as you can.",
    "Describe a recent decision and why you made it.",
    "Give a short recommendation for a book, film, or app.",
    "Explain how you would help a new teammate get started.",
  ],
};

const fillerPattern = /\b(um+|uh+|erm+|like|you know|basically|actually)\b/gi;

export function FluencyExercises() {
  const [exercise, setExercise] = useState<Exercise>("daily");
  const [promptIndex, setPromptIndex] = useState(() => new Date().getDate() % prompts.daily.length);
  const [response, setResponse] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showReflection, setShowReflection] = useState(false);

  const currentPrompts = prompts[exercise];
  const prompt = currentPrompts[promptIndex % currentPrompts.length];
  const wordCount = useMemo(() => response.trim() ? response.trim().split(/\s+/).length : 0, [response]);
  const fillerMatches = useMemo(() => response.match(fillerPattern) ?? [], [response]);

  useEffect(() => {
    if (!timerRunning || secondsRemaining <= 0) return;
    const timer = window.setTimeout(() => setSecondsRemaining((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [timerRunning, secondsRemaining]);

  function selectExercise(nextExercise: Exercise) {
    setExercise(nextExercise);
    setPromptIndex(0);
    setResponse("");
    setSecondsRemaining(60);
    setTimerRunning(false);
    setShowReflection(false);
  }

  function nextPrompt() {
    setPromptIndex((index) => (index + 1) % currentPrompts.length);
    setResponse("");
    setSecondsRemaining(60);
    setTimerRunning(false);
    setShowReflection(false);
  }

  function startTimer() {
    if (secondsRemaining === 0) setSecondsRemaining(60);
    setShowReflection(false);
    setTimerRunning(true);
  }

  function finishExercise() {
    setTimerRunning(false);
    setShowReflection(true);
  }

  return (
    <section className="fluency-workspace" aria-label="Fluency exercises">
      <div className="fluency-exercise-grid">
        {exercises.map((item) => (
          <button key={item.id} type="button" className={`fluency-exercise-card ${exercise === item.id ? "active" : ""}`} aria-pressed={exercise === item.id} onClick={() => selectExercise(item.id)}>
            <span className="fluency-card-icon" aria-hidden="true">{item.icon}</span>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>

      <section className="fluency-prompt-card">
        <div className="fluency-prompt-header">
          <div><p className="eyebrow">YOUR PRACTICE PROMPT</p><h2>{exercises.find((item) => item.id === exercise)?.title}</h2></div>
          {exercise === "minute" && <div className={`fluency-timer ${secondsRemaining <= 10 ? "urgent" : ""}`} role="timer" aria-label={`${secondsRemaining} seconds remaining`}>00:{String(secondsRemaining).padStart(2, "0")}</div>}
        </div>
        <p className="fluency-prompt-text">{prompt}</p>
        <label className="fluency-response-label" htmlFor="fluency-response">Your response</label>
        <textarea id="fluency-response" value={response} onChange={(event) => { setResponse(event.target.value); setShowReflection(false); }} placeholder={exercise === "minute" ? "Keep going—write what you would say out loud…" : "Write your answer here, or speak it aloud and then note the key points…"} rows={6} />
        <div className="fluency-response-meta"><span>{wordCount} words</span>{exercise === "fillers" && <span>{fillerMatches.length} possible filler words detected</span>}</div>
        {exercise === "fillers" && <div className="filler-note">We count common filler expressions in the text you enter. This is a writing aid, not automatic analysis of your spoken audio.</div>}
        {exercise === "minute" && <div className="fluency-timer-actions"><button type="button" className="button button-primary" onClick={timerRunning && secondsRemaining > 0 ? () => setTimerRunning(false) : startTimer}>{timerRunning && secondsRemaining > 0 ? "Pause timer" : secondsRemaining === 60 ? "Start 1-minute timer" : secondsRemaining === 0 ? "Restart timer" : "Resume timer"}</button><button type="button" className="notebook-secondary" onClick={() => { setTimerRunning(false); setSecondsRemaining(60); }}>Reset timer</button></div>}
        <div className="fluency-actions"><button type="button" className="notebook-secondary" onClick={nextPrompt}>Try another prompt</button><button type="button" className="button button-primary" onClick={finishExercise} disabled={!response.trim()}>Finish exercise</button></div>
        {showReflection && <div className="fluency-reflection" role="status"><strong>Nice work showing up.</strong><p>You wrote {wordCount} words. Read your answer aloud once more, then try to make one sentence clearer or more specific. {exercise === "fillers" ? `Review the ${fillerMatches.length} possible filler word(s) and decide which ones are needed.` : "Focus on communicating your idea, not on being perfect."}</p></div>}
      </section>
      <p className="fluency-disclaimer">These exercises help you practise consistency and organize your thoughts. Word counts and filler-word matches are simple text-based signals, not a validated fluency or speaking-proficiency score.</p>
    </section>
  );
}
