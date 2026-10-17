"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListenButton } from "@/components/listen-button";

type Exercise = "quick" | "daily" | "minute" | "fillers";
type FluencyHistoryEntry = { id: string; exercise: Exercise; prompt: string; transcript: string; createdAt: string; durationSeconds: number };
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

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
  const [timerStarted, setTimerStarted] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speakingSeconds, setSpeakingSeconds] = useState(0);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [history, setHistory] = useState<FluencyHistoryEntry[]>([]);
  const [historyNotice, setHistoryNotice] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const responseRef = useRef("");
  const speakingStartedAt = useRef<number | null>(null);

  const currentPrompts = prompts[exercise];
  const prompt = currentPrompts[promptIndex % currentPrompts.length];
  const wordCount = useMemo(() => response.trim() ? response.trim().split(/\s+/).length : 0, [response]);
  const fillerMatches = useMemo(() => response.match(fillerPattern) ?? [], [response]);

  useEffect(() => {
    const browser = window as SpeechWindow;
    setSpeechSupported(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));
    void fetch("/api/fluency-history", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { history?: FluencyHistoryEntry[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not load speaking history.");
        setHistory(Array.isArray(payload.history) ? payload.history : []);
      })
      .catch(() => setHistoryNotice("Could not load speaking history from the database. Refresh to retry."));
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!isSpeaking || speakingStartedAt.current === null) return;
    const timer = window.setInterval(() => setSpeakingSeconds(Math.floor((Date.now() - (speakingStartedAt.current ?? Date.now())) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [isSpeaking]);

  useEffect(() => {
    if (!timerRunning || secondsRemaining <= 0) return;
    const timer = window.setTimeout(() => setSecondsRemaining((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [timerRunning, secondsRemaining]);

  function selectExercise(nextExercise: Exercise) {
    setExercise(nextExercise);
    setPromptIndex(0);
    setResponse("");
    responseRef.current = "";
    setSecondsRemaining(60);
    setTimerRunning(false);
    setTimerStarted(false);
    setShowReflection(false);
  }

  function nextPrompt() {
    setPromptIndex((index) => (index + 1) % currentPrompts.length);
    setResponse("");
    responseRef.current = "";
    setSecondsRemaining(60);
    setTimerRunning(false);
    setTimerStarted(false);
    setShowReflection(false);
  }

  function startTimer() {
    if (secondsRemaining === 0) setSecondsRemaining(60);
    setShowReflection(false);
    setTimerStarted(true);
    setTimerRunning(true);
  }

  async function saveSpeakingHistory() {
    const spoken = responseRef.current.trim();
    if (!spoken) {
      setHistoryNotice("No speech transcript was captured. Start speaking and try again.");
      return;
    }
    const durationSeconds = speakingStartedAt.current === null ? speakingSeconds : Math.max(0, Math.floor((Date.now() - speakingStartedAt.current) / 1000));
    try {
      const response = await fetch("/api/fluency-history", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercise, prompt, transcript: spoken, durationSeconds }),
      });
      const payload = await response.json() as { entry?: FluencyHistoryEntry; error?: string };
      if (!response.ok || !payload.entry) throw new Error(payload.error || "Could not save speaking history.");
      setHistory((current) => [payload.entry!, ...current].slice(0, 100));
      setHistoryNotice("Your spoken response was saved to the database.");
    } catch {
      setHistoryNotice("Could not save this speaking session to the database. Try again.");
    }
  }

  function startSpeaking() {
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) {
      setHistoryNotice("Speech recognition is unavailable in this browser. Try a Chromium-based browser and allow microphone access.");
      return;
    }
    window.speechSynthesis?.cancel();
    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) parts.push(event.results[i]?.[0]?.transcript ?? "");
      const next = parts.join(" ").trim();
      responseRef.current = next;
      setResponse(next);
      setShowReflection(false);
    };
    recognition.onerror = (event) => {
      setHistoryNotice(event.error === "not-allowed" ? "Microphone permission was denied. Allow microphone access in your browser." : "Speech capture stopped. You can save any transcript captured so far.");
      setIsSpeaking(false);
    };
    recognition.onend = () => {
      setIsSpeaking(false);
    };
    recognitionRef.current = recognition;
    responseRef.current = "";
    setResponse("");
    setSpeakingSeconds(0);
    speakingStartedAt.current = Date.now();
    setHistoryNotice("Listening to your voice… speak naturally, then select Stop speaking & save.");
    try {
      recognition.start();
      setIsSpeaking(true);
    } catch {
      setIsSpeaking(false);
      speakingStartedAt.current = null;
      setHistoryNotice("Could not start speech capture. Check microphone permission and try again.");
    }
  }

  function stopSpeaking() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsSpeaking(false);
    void saveSpeakingHistory();
    setShowReflection(true);
  }

  function finishExercise() {
    setTimerRunning(false);
    if (isSpeaking) stopSpeaking();
    else setShowReflection(true);
  }

  return (
    <section className="fluency-workspace" aria-label="Fluency exercises">
      <div className="fluency-tabs" role="tablist" aria-label="Fluency practice views"><button type="button" role="tab" aria-selected={activeTab === "current"} className={activeTab === "current" ? "active" : ""} onClick={() => setActiveTab("current")}>Speaking practice</button><button type="button" role="tab" aria-selected={activeTab === "history"} className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>Speaking history <span>{history.length}</span></button></div>
      {activeTab === "current" ? <>
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
        <p className="fluency-prompt-text">{prompt}</p><ListenButton text={prompt} label="Listen to this prompt" />
        <div className="fluency-speaking-console">
          <div><span className={isSpeaking ? "fluency-speaking-indicator live" : "fluency-speaking-indicator"} /> <strong>{isSpeaking ? "Listening to you speak" : "Speaking is the main exercise"}</strong><p>{isSpeaking ? "Talk naturally. Your transcript appears below while you speak." : "Press Start speaking and answer the prompt out loud. Your spoken transcript will be saved to your database history."}</p></div>
          <div className="fluency-speaking-actions">{!isSpeaking ? <button type="button" className="button button-primary" onClick={startSpeaking}>🎙 Start speaking</button> : <button type="button" className="button button-primary" onClick={stopSpeaking}>■ Stop speaking & save</button>}<span>{Math.floor(speakingSeconds / 60)}:{String(speakingSeconds % 60).padStart(2, "0")}</span></div>
          {!speechSupported && <p className="fluency-speech-warning">This browser may not support speech recognition. For voice-to-text feedback, use Chrome or Edge and allow microphone access.</p>}
        </div>
        <label className="fluency-response-label" htmlFor="fluency-response">Transcript of your spoken answer</label>
        <textarea id="fluency-response" value={response} onChange={(event) => { setResponse(event.target.value); responseRef.current = event.target.value; setShowReflection(false); }} placeholder="Your speech transcript will appear here after you start speaking. You can correct recognition mistakes if needed." rows={5} />
        <div className="fluency-response-meta"><span>{wordCount} words detected</span>{exercise === "fillers" && <span>{fillerMatches.length} possible filler words detected</span>}</div>
        {exercise === "fillers" && <div className="filler-note">Filler-word analysis runs on the speech transcript captured from your microphone, rather than requiring you to type your answer.</div>}
        {exercise === "minute" && <div className="fluency-timer-actions"><button type="button" className="button button-primary" onClick={timerRunning && secondsRemaining > 0 ? () => setTimerRunning(false) : startTimer}>{timerRunning && secondsRemaining > 0 ? "Pause timer" : secondsRemaining === 0 ? "Restart timer" : timerStarted ? "Resume timer" : "Start 1-minute timer"}</button><button type="button" className="notebook-secondary" onClick={() => { setTimerRunning(false); setTimerStarted(false); setSecondsRemaining(60); }}>Reset timer</button></div>}
        <div className="fluency-actions"><button type="button" className="notebook-secondary" onClick={nextPrompt}>Try another prompt</button><button type="button" className="button button-primary" onClick={finishExercise} disabled={!response.trim()}>Finish exercise</button></div>
        {showReflection && <div className="fluency-reflection" role="status"><strong>Nice work showing up.</strong><p>Your transcript contains {wordCount} words. Say your answer aloud once more, then try to make one sentence clearer or more specific. {exercise === "fillers" ? `Review the ${fillerMatches.length} possible filler word(s) and decide which ones are needed.` : "Focus on communicating your idea, not on being perfect."}</p></div>}
      </section>
      <p className="fluency-disclaimer">Speaking practice uses browser speech recognition to create a transcript. Word counts and filler-word matches are simple transcript-based coaching signals, not a validated fluency or speaking-proficiency score. Speech recognition support varies by browser.</p>
      </> : <section className="fluency-speaking-history" aria-label="Saved speaking history"><div className="fluency-history-header"><div><p className="eyebrow">YOUR SPEAKING LOG</p><h2>Speaking history</h2><p>Responses are stored in the application database so you can review your progress.</p></div><button type="button" className="notebook-secondary" disabled={!history.length} onClick={async () => { if (!window.confirm("Delete all saved speaking history?")) return; const response = await fetch("/api/fluency-history?id=all", { method: "DELETE" }); if (response.ok) { setHistory([]); setHistoryNotice("Speaking history cleared."); } else setHistoryNotice("Could not clear speaking history."); }}>Clear history</button></div>
        {historyNotice && <p className="feature-note" role="status">{historyNotice}</p>}
        {history.length === 0 ? <div className="shadowing-history-empty"><strong>No speaking sessions saved yet</strong><p>Go to Speaking practice, answer a prompt out loud, then stop and save your session.</p></div> : <div className="fluency-history-list">{history.map((entry) => <article className="fluency-history-entry" key={entry.id}><div className="fluency-history-entry-top"><span>{exercises.find((item) => item.id === entry.exercise)?.title ?? entry.exercise}</span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time><span>{Math.floor(entry.durationSeconds / 60)}:{String(entry.durationSeconds % 60).padStart(2, "0")}</span></div><p className="fluency-history-prompt"><strong>Prompt:</strong> {entry.prompt}</p><p className="fluency-history-transcript">{entry.transcript}</p><div className="fluency-history-actions"><button type="button" className="text-link" onClick={() => { setExercise(entry.exercise); const targetIndex = prompts[entry.exercise].indexOf(entry.prompt); setPromptIndex(targetIndex >= 0 ? targetIndex : 0); setResponse(""); responseRef.current = ""; setActiveTab("current"); setHistoryNotice("Prompt loaded. Start speaking to practise it again."); }}>Practise prompt again ↗</button><button type="button" className="text-link" onClick={async () => { const response = await fetch("/api/fluency-history?id="+encodeURIComponent(entry.id), { method: "DELETE" }); if (response.ok) setHistory((current) => current.filter((item) => item.id !== entry.id)); else setHistoryNotice("Could not delete this session."); }}>Delete</button></div></article>)}</div>}
      </section>}
    </section>
  );
}
