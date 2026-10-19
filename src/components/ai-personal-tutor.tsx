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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [memoryReady, setMemoryReady] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
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
    let active = true;
    async function restoreTutorMemory() {
      try {
        const response = await fetch("/api/tutor-memory", { cache: "no-store" });
        if (!response.ok) throw new Error("Tutor history could not be loaded.");
        const payload = await response.json() as { conversation?: { id: string; messages: Message[]; goal: string; level: string; feedbackStyle: "balanced" | "detailed" } | null; conversations?: Array<{ id: string; title: string; updatedAt: string }> };
        if (!active) return;
        setConversationHistory(payload.conversations ?? []);
        if (payload.conversation) {
          setConversationId(payload.conversation.id);
          setMessages(payload.conversation.messages);
          if (GOALS.some((item) => item.value === payload.conversation?.goal)) setGoal(payload.conversation.goal as typeof goal);
          if (LEVELS.includes(payload.conversation.level as typeof level)) setLevel(payload.conversation.level as typeof level);
          if (payload.conversation.feedbackStyle === "balanced" || payload.conversation.feedbackStyle === "detailed") setFeedback(payload.conversation.feedbackStyle);
        } else {
          const created = await fetch("/api/tutor-memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ goal, level, feedbackStyle: feedback }),
          });
          if (!created.ok) throw new Error("A tutor session could not be started.");
          const result = await created.json() as { conversation?: { id: string }; conversations?: Array<{ id: string; title: string; updatedAt: string }> };
          if (active && result.conversation) setConversationId(result.conversation.id);
          if (active) setConversationHistory(result.conversations ?? []);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Tutor history could not be loaded.");
      } finally {
        if (active) setMemoryReady(true);
      }
    }
    void restoreTutorMemory();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, busy]);

  async function sendMessage(value = input) {
    const text = value.trim();
    if (!text || busy || !memoryReady) return;
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
          conversationId,
          scenario: "Free conversation",
          difficulty: level,
          feedbackStyle: feedback,
          sessionGoal: goal,
          messages: [{ role: "user", content: text }],
        }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "The tutor could not respond. Please try again.");
      }
      const returnedConversationId = response.headers.get("X-Conversation-Id");
      if (returnedConversationId) setConversationId(returnedConversationId);
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

  async function resetConversation() {
    if (busy) return;
    setError("");
    try {
      const response = await fetch("/api/tutor-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, level, feedbackStyle: feedback }),
      });
      const payload = await response.json() as { conversation?: { id: string }; error?: string };
      if (!response.ok || !payload.conversation) throw new Error(payload.error || "A fresh tutor session could not be started.");
      setConversationId(payload.conversation.id);
      setMessages([]);
      setInput("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A fresh tutor session could not be started.");
    }
  }

  return (
    <div className={styles.layout}>
      <section className={styles.main} aria-label="AI tutor conversation">
        <div className={styles.intro}>
          <div className={styles.avatar} aria-hidden="true">✦</div>
          <div><p className={styles.eyebrow}>YOUR PERSONAL COACH</p><h2>What would you like to work on?</h2><p>Ask a question, practise a response, or share a sentence you want to improve. Your tutor will guide you one step at a time.</p></div>
        </div>
        <div className={styles.messages} aria-live="polite">
          {messages.length === 0 && <div className={styles.starters}><p className={styles.starterTitle}>Try starting with</p>{STARTERS.map((starter) => <button key={starter} type="button" onClick={() => void sendMessage(starter)} disabled={busy || !memoryReady}>{starter}<span aria-hidden="true">↗</span></button>)}</div>}
          {messages.map((message, index) => <article key={index} className={message.role === "user" ? styles.userMessage : styles.tutorMessage}><span className={styles.messageLabel}>{message.role === "user" ? "YOU" : "YOUR TUTOR"}</span><p>{message.content || (busy ? "Thinking…" : "")}</p></article>)}
          {busy && <p className={styles.status}>Your tutor is preparing a helpful response…</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div ref={bottomRef} />
        </div>
        <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
          <label className={styles.srOnly} htmlFor="tutor-message">Your question or practice response</label>
          <textarea id="tutor-message" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask your tutor something…" rows={2} maxLength={4000} disabled={busy || !memoryReady} />
          <div className={styles.composerFooter}><span>{input.length}/4000 · Ask, practise, improve</span><button type="submit" disabled={busy || !memoryReady || !input.trim()}>{busy ? "Working…" : "Send"} <span aria-hidden="true">↑</span></button></div>
        </form>
      </section>
      <aside className={styles.sidebar}>
        <div className={styles.panel}><p className={styles.eyebrow}>PERSONALISE PRACTICE</p><h3>Your learning focus</h3><label htmlFor="tutor-goal">Main goal</label><select id="tutor-goal" value={goal} onChange={(event) => setGoal(event.target.value as typeof goal)}>{GOALS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><label htmlFor="tutor-level">English level</label><select id="tutor-level" value={level} onChange={(event) => setLevel(event.target.value as typeof level)}>{LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}</select><label htmlFor="tutor-feedback">Feedback style</label><select id="tutor-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value as typeof feedback)}><option value="balanced">Balanced and encouraging</option><option value="detailed">Detailed explanations</option></select><p className={styles.hint}>Changes apply to your next message.</p></div>
        <div className={styles.panel}><p className={styles.eyebrow}>YOUR LEARNING CONTEXT</p><h3>Building on your work</h3><div className={styles.stat}><strong>{wordCount}</strong><span>saved vocabulary items</span></div><div className={styles.stat}><strong>{sessionCount}</strong><span>saved practice sessions</span></div><p className={styles.hint}>Keep learning connected by saving useful words and practising regularly.</p></div>
        <button className={styles.reset} type="button" onClick={resetConversation} disabled={busy || !memoryReady}>Start a fresh tutoring session</button>
      </aside>
    </div>
  );
}
