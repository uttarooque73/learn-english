"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./speakup-adventures.module.css";

type Message = { role: "user" | "assistant"; content: string };
type Chapter = {
  id: string;
  location: string;
  emoji: string;
  title: string;
  character: string;
  role: string;
  scene: string;
  goal: string;
  clue: string;
  choices: string[];
  reward: number;
};

const CHAPTERS: Chapter[] = [
  {
    id: "station",
    location: "Chapter 01 · THE ARRIVAL",
    emoji: "🚉",
    title: "The Missing Ticket",
    character: "Maya, the station guide",
    role: "A helpful station guide who knows the city",
    scene: "You arrive in the strange city of Verba. Your train leaves soon, but your ticket has disappeared. Maya spots you looking worried.",
    goal: "Explain your problem clearly and ask for help politely.",
    clue: "A blue suitcase was found near platform three.",
    choices: ["Ask Maya to help me retrace my steps.", "Explain what the ticket looks like.", "Ask whether someone handed it in."],
    reward: 100,
  },
  {
    id: "market",
    location: "Chapter 02 · THE OLD MARKET",
    emoji: "🧺",
    title: "The Merchant's Riddle",
    character: "Rafi, a clever market merchant",
    role: "A playful merchant who speaks in riddles but wants to help",
    scene: "A note from Maya leads you to the Old Market. Rafi has found a key, but he will trade it only after you solve a small mystery.",
    goal: "Ask follow-up questions, clarify details, and explain your reasoning.",
    clue: "The key was wrapped in a receipt with three words underlined.",
    choices: ["Ask Rafi for a hint.", "Offer a theory and explain why.", "Politely negotiate a different trade."],
    reward: 150,
  },
  {
    id: "library",
    location: "Chapter 03 · THE WHISPERING LIBRARY",
    emoji: "📚",
    title: "The Final Clue",
    character: "Ada, the library archivist",
    role: "A thoughtful archivist who helps you connect clues",
    scene: "The key opens a hidden drawer in the city library. Ada has one final question before revealing where the missing ticket is kept.",
    goal: "Summarize what you learned and make a confident request.",
    clue: "The three underlined words point to a place where journeys begin.",
    choices: ["Summarize the clues for Ada.", "Ask Ada to explain the last hint.", "Make your best guess and justify it."],
    reward: 200,
  },
];

const STORAGE_KEY = "speakup-adventures-progress-v1";
const MAX_TURNS = 24;

type SavedProgress = { xp: number; unlocked: number; completed: string[] };

function readProgress(): SavedProgress {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<SavedProgress>;
    return {
      xp: Number.isFinite(value.xp) ? Math.max(0, Math.floor(value.xp ?? 0)) : 0,
      unlocked: Number.isFinite(value.unlocked) ? Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(value.unlocked ?? 0))) : 0,
      completed: Array.isArray(value.completed) ? value.completed.filter((id): id is string => CHAPTERS.some((chapter) => chapter.id === id)) : [],
    };
  } catch {
    return { xp: 0, unlocked: 0, completed: [] };
  }
}

export function SpeakUpAdventures() {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [progress, setProgress] = useState<SavedProgress>({ xp: 0, unlocked: 0, completed: [] });
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const chapter = CHAPTERS[chapterIndex];
  const userTurns = useMemo(() => messages.filter((message) => message.role === "user").length, [messages]);
  const completed = progress.completed.includes(chapter.id);

  useEffect(() => {
    setProgress(readProgress());
    setReady(true);
    const browser = window as Window & { SpeechRecognition?: new () => { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void }; webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void } };
    setVoiceAvailable(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function persist(next: SavedProgress) {
    setProgress(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setError("Progress is only saved for this session because browser storage is unavailable.");
    }
  }

  function beginChapter(index = chapterIndex) {
    const next = CHAPTERS[index];
    setChapterIndex(index);
    setMessages([{ role: "assistant", content: next.scene + " " + next.character + " smiles and asks, “What seems to be the problem?”" }]);
    setInput("");
    setError("");
    setStarted(true);
  }

  async function sendMessage(text = input) {
    const content = text.trim();
    if (!content || busy || messages.length >= MAX_TURNS) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError("");
    setMessages((current) => [...current, { role: "user", content }]);
    const scenario = {
      title: "SpeakUp Adventures: " + chapter.title,
      originalSituation: chapter.scene + " Current clue: " + chapter.clue,
      learnerRole: "The player investigating a friendly English-learning mystery",
      aiRole: chapter.role,
      stakes: "Help the player progress through a branching story while practising English. The story should respond to their choices.",
      systemPrompt: "You are " + chapter.character + " in SpeakUp Adventures, an interactive mystery in the fictional city of Verba. Stay in character, react to the player's exact message, and move the mystery forward in small steps. Keep the reply to 2-5 short sentences and finish with one natural question or a meaningful choice. Weave in one useful natural English phrase when appropriate, but do not interrupt the story with a lecture. Be warm and accessible for an English learner. Never claim to assess pronunciation. Current mission goal: " + chapter.goal + " Current clue: " + chapter.clue + " Let the player's words and decisions affect what you reveal next. Do not reveal all clues at once.",
    };
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "conversation",
          scenario: "Free conversation",
          difficulty: "Intermediate",
          sessionGoal: "Speak more confidently",
          feedbackStyle: "balanced",
          messages: nextMessages,
          customScenario: scenario,
        }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(detail?.error || "The adventure guide could not respond. Check that the configured AI provider is running.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      setMessages((current) => [...current, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const streamed = reply;
        setMessages((current) => {
          const updated = [...current];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") updated[updated.length - 1] = { role: "assistant", content: streamed };
          return updated;
        });
      }
      reply += decoder.decode();
      if (!reply.trim()) throw new Error("The adventure guide returned an empty reply. Please try again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
      setMessages((current) => current.filter((message, index) => !(message.role === "assistant" && !message.content && index === current.length - 1)));
    } finally {
      setBusy(false);
    }
  }

  function useMicrophone() {
    const browser = window as Window & { SpeechRecognition?: new () => { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void }; webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void } };
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Speech recognition is not available in this browser. You can still type your reply.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) setInput((previous) => previous ? previous + " " + transcript : transcript);
    };
    recognition.onerror = () => setError("Microphone input did not work. Check browser microphone permission or type your reply.");
    recognition.onend = () => setSpeaking(false);
    setSpeaking(true);
    try { recognition.start(); } catch { setSpeaking(false); setError("Could not start the microphone. Please try again."); }
  }

  function completeChapter() {
    if (completed || userTurns < 2 || busy) return;
    const nextIndex = Math.min(CHAPTERS.length - 1, chapterIndex + 1);
    const next: SavedProgress = {
      xp: progress.xp + chapter.reward,
      unlocked: Math.max(progress.unlocked, nextIndex),
      completed: [...progress.completed, chapter.id],
    };
    persist(next);
    setMessages((current) => [...current, { role: "assistant", content: "Mission complete! You earned " + chapter.reward + " XP. Your English practice moved the mystery forward—ready for the next chapter?" }]);
  }

  function resetAdventure() {
    persist({ xp: 0, unlocked: 0, completed: [] });
    setChapterIndex(0);
    setMessages([]);
    setInput("");
    setStarted(false);
    setError("");
  }

  return (
    <div className={styles.adventure}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>✦ A STORY THAT SPEAKS BACK</span>
          <h2>Your words.<br /><em>Your choices.</em><br />One unforgettable adventure.</h2>
          <p>Explore a curious city, meet AI characters, follow clues, and unlock the story by speaking English. Every choice changes the conversation.</p>
          <div className={styles.stats}>
            <div><strong>{ready ? progress.xp : "—"}</strong><span>XP collected</span></div>
            <div><strong>{ready ? progress.completed.length : "—"}</strong><span>Missions solved</span></div>
            <div><strong>3</strong><span>Story chapters</span></div>
          </div>
        </div>
        <div className={styles.heroArt} aria-hidden="true"><span className={styles.planet}>✦</span><span className={styles.heroEmoji}>🗺️</span><span className={styles.artTag}>THE CITY OF VERBA</span></div>
      </section>

      <section className={styles.mapSection} aria-label="Adventure map">
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>YOUR STORY MAP</span><h3>Choose your next destination</h3></div><span className={styles.mapNote}>Complete missions to earn XP</span></div>
        <div className={styles.mapGrid}>
          {CHAPTERS.map((item, index) => {
            const unlocked = index <= progress.unlocked;
            const done = progress.completed.includes(item.id);
            return <button key={item.id} type="button" className={styles.locationCard + (chapterIndex === index ? " " + styles.selected : "")} disabled={!unlocked} aria-pressed={chapterIndex === index} onClick={() => beginChapter(index)}>
              <span className={styles.locationIcon}>{unlocked ? item.emoji : "🔒"}</span><span className={styles.locationNumber}>{item.location}</span><strong>{item.title}</strong><span className={styles.locationDescription}>{index === 0 ? "Find the ticket before the train leaves." : index === 1 ? "Trade clues with a mysterious merchant." : "Connect the clues and solve the mystery."}</span><span className={styles.locationStatus}>{done ? "✓ MISSION SOLVED" : unlocked ? "ENTER LOCATION ↗" : "LOCKED — SOLVE THE PREVIOUS MISSION"}</span>
            </button>;
          })}
        </div>
      </section>

      <section className={styles.storyPanel}>
        <div className={styles.storyHeader}>
          <div><span className={styles.eyebrow}>{chapter.location}</span><h3>{chapter.emoji} {chapter.title}</h3><p>Mission goal: {chapter.goal}</p></div>
          <span className={styles.reward}>✦ {chapter.reward} XP</span>
        </div>
        {!started ? <div className={styles.startCard}><span>🎭</span><h4>Ready to enter the story?</h4><p>Meet {chapter.character}, practise your English, and decide what happens next.</p><button className={styles.primaryButton} type="button" onClick={() => beginChapter()}>Start adventure <span>↗</span></button></div> : <>
          <div className={styles.chatLog} aria-live="polite" aria-label="Adventure conversation">
            {messages.map((message, index) => <div key={index} className={styles.message + (message.role === "user" ? " " + styles.playerMessage : "")}><span className={styles.speaker}>{message.role === "user" ? "YOU" : chapter.character.toUpperCase()}</span><p>{message.content || (busy ? "Thinking…" : "")}</p></div>)}
            {busy && <div className={styles.thinking} role="status"><span /> The story is unfolding…</div>}
            <div ref={endRef} />
          </div>
          <div className={styles.choiceBlock}><span className={styles.eyebrow}>WHAT WILL YOU SAY?</span><div className={styles.choiceGrid}>{chapter.choices.map((choice) => <button key={choice} type="button" className={styles.choiceButton} disabled={busy || messages.length >= MAX_TURNS} onClick={() => sendMessage(choice)}>{choice}<span>↗</span></button>)}</div></div>
          <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <label htmlFor="adventure-reply">Your reply <span>{userTurns}/{Math.floor(MAX_TURNS / 2)} turns</span></label>
            <textarea id="adventure-reply" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Write or dictate what you would say…" rows={3} maxLength={4000} disabled={busy || messages.length >= MAX_TURNS} />
            <div className={styles.composerActions}>{voiceAvailable && <button className={styles.secondaryButton} type="button" onClick={useMicrophone} disabled={busy || speaking}>{speaking ? "Listening…" : "🎙 Speak"}</button>}<button className={styles.primaryButton} type="submit" disabled={!input.trim() || busy || messages.length >= MAX_TURNS}>{busy ? "Replying…" : "Send reply"} <span>↗</span></button></div>
          </form>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.missionFooter}><p>{userTurns < 2 ? "Explore the conversation with at least two replies to unlock mission completion." : completed ? "Mission solved. You can revisit this chapter or continue to the next unlocked location." : "You have explored the scene. Complete the mission to unlock the next destination."}</p><button className={styles.completeButton} type="button" disabled={completed || userTurns < 2 || busy} onClick={completeChapter}>{completed ? "Mission completed ✓" : "Complete mission + " + chapter.reward + " XP"}</button></div>
        </>}
      </section>
      <div className={styles.bottomRow}><p>Progress is saved in this browser. AI replies use your app's configured provider.</p><button type="button" className={styles.resetButton} onClick={resetAdventure}>Reset adventure</button></div>
    </div>
  );
}
