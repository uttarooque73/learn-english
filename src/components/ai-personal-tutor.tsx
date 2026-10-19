"use client";

import { useEffect, useRef, useState } from "react";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import { getSessions, getVocabulary } from "@/lib/learning-storage";
import styles from "./ai-personal-tutor.module.css";

type Message = { role: "user" | "assistant"; content: string };
const GOALS = [
  { value: "Speak more confidently", label: "Speak confidently" },
  { value: "Improve grammar", label: "Improve grammar" },
  { value: "Expand vocabulary", label: "Grow vocabulary" },
  { value: "Practice workplace English", label: "Workplace English" },
  { value: "Prepare for an interview", label: "Interview preparation" },
  { value: "Improve fluency", label: "Improve fluency" },
] as const;
const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
const STARTERS = ["Help me explain my work clearly.", "Teach me a more natural way to say something.", "Ask me questions and help me improve my answer."];

export function AiPersonalTutor() {
  const [goal, setGoal] = useState<(typeof GOALS)[number]["value"]>("Speak more confidently");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Intermediate");
  const [feedback, setFeedback] = useState<"balanced" | "detailed">("balanced");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (!active) return;
      setWordCount(getVocabulary().length);
      setSessionCount(getSessions().length);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function sendMessage(value = input) {
    const text = value.trim();
    if (!text || busy) return;
    setError("");
    setInput("");
    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "tutor",
          scenario: "Free conversation",
          difficulty: level,
          feedbackStyle: feedback,
          sessionGoal: goal,
          messages: [
            { role: "user", content: "Learner request: " + text + ". My current goal is " + goal + ". My saved vocabulary bank has " + wordCount + " items and I have " + sessionCount + " saved practice sessions; use that context only when relevant." },
          ],
        }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "The tutor could not respond. Please try again.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        answer += decoder.decode(chunk, { stream: true });
        setMessages([...nextMessages, { role: "assistant", content: answer }]);
      }
      answer += decoder.decode();
      setMessages([...nextMessages, { role: "assistant", content: answer.trim() || "Let's try that again. Could you rephrase your request?" }]);
    } catch (cause) {
      setMessages(nextMessages);
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function resetConversation() {
    if (busy) return;
    setMessages([]);
    setInput("");
    setError("");
  }

  return (
    <div className={styles.layout}>
      <section className={styles.main} aria-label="AI tutor conversation">
        <div className={styles.intro}>
          <div className={styles.avatar} aria-hidden="true">✦</div>
          <div><p className={styles.eyebrow}>YOUR PERSONAL COACH</p><h2>What would you like to work on?</h2><p>Ask a question, practise a response, or share a sentence you want to improve. Your tutor will guide you one step at a time.</p></div>
        </div>
        <div className={styles.messages} aria-live="polite">
          {messages.length === 0 && <div className={styles.starters}><p className={styles.starterTitle}>Try starting with</p>{STARTERS.map((starter) => <button key={starter} type="button" onClick={() => void sendMessage(starter)} disabled={busy}>{starter}<span aria-hidden="true">↗</span></button>)}</div>}
          {messages.map((message, index) => <article key={index} className={message.role === "user" ? styles.userMessage : styles.tutorMessage}><span className={styles.messageLabel}>{message.role === "user" ? "YOU" : "YOUR TUTOR"}</span><p>{message.content || (busy ? "Thinking…" : "")}</p></article>)}
          {busy && <p className={styles.status}>Your tutor is preparing a helpful response…</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div ref={bottomRef} />
        </div>
        <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
          <label className={styles.srOnly} htmlFor="tutor-message">Your question or practice response</label>
          <textarea id="tutor-message" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask your tutor something…" rows={2} maxLength={4000} disabled={busy} />
          <div className={styles.composerFooter}><span>{input.length}/4000 · Ask, practise, improve</span><button type="submit" disabled={busy || !input.trim()}>{busy ? "Working…" : "Send"} <span aria-hidden="true">↑</span></button></div>
        </form>
      </section>
      <aside className={styles.sidebar}>
        <div className={styles.panel}><p className={styles.eyebrow}>PERSONALISE PRACTICE</p><h3>Your learning focus</h3><label htmlFor="tutor-goal">Main goal</label><select id="tutor-goal" value={goal} onChange={(event) => setGoal(event.target.value as typeof goal)}>{GOALS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><label htmlFor="tutor-level">English level</label><select id="tutor-level" value={level} onChange={(event) => setLevel(event.target.value as typeof level)}>{LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}</select><label htmlFor="tutor-feedback">Feedback style</label><select id="tutor-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value as typeof feedback)}><option value="balanced">Balanced and encouraging</option><option value="detailed">Detailed explanations</option></select><p className={styles.hint}>Changes apply to your next message.</p></div>
        <div className={styles.panel}><p className={styles.eyebrow}>YOUR LEARNING CONTEXT</p><h3>Building on your work</h3><div className={styles.stat}><strong>{wordCount}</strong><span>saved vocabulary items</span></div><div className={styles.stat}><strong>{sessionCount}</strong><span>saved practice sessions</span></div><p className={styles.hint}>Keep learning connected by saving useful words and practising regularly.</p></div>
        <button className={styles.reset} type="button" onClick={resetConversation} disabled={busy || messages.length === 0}>Start a fresh tutoring session</button>
      </aside>
    </div>
  );
}
