"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string; createdAt: string };
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionError = { error: string };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

const TOPICS = ["Random Topic", "Technology", "Software Development", "Work and Meetings", "Travel", "Food and Cooking", "Daily Life", "Business", "Science", "Current Affairs", "Custom Topic"];
const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function FloatingEnglishPartner() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready when you are");
  const [messages, setMessages] = useState<Message[]>([]);
  const [topic, setTopic] = useState("Random Topic");
  const [customTopic, setCustomTopic] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Intermediate");
  const [tab, setTab] = useState<"conversation" | "feedback">("conversation");
  const [feedback, setFeedback] = useState<Array<Record<string, unknown>>>([]);
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "processing" | "complete" | "partial" | "failed">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const sessionIdRef = useRef("");
  const transcriptSequenceRef = useRef(0);
  const recognitionRef = useRef<Recognition | null>(null);
  const shouldListenRef = useRef(false);
  const busyRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const startedAtRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesRef.current = messages; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => () => {
    shouldListenRef.current = false;
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  const append = useCallback((role: Role, content: string) => {
    const message = { id: newId(), role, content: content.trim(), createdAt: new Date().toISOString() };
    if (!message.content) return null;
    setMessages((current) => [...current, message]);
    const currentSessionId = sessionIdRef.current;
    if (currentSessionId) {
      const sequenceNumber = transcriptSequenceRef.current++;
      void fetch("/api/voice-conversations/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId, topic, proficiency: level,
          startedAt: new Date(startedAtRef.current).toISOString(), sequenceNumber,
          message,
        }),
      }).then((result) => { if (!result.ok) setStatus("Transcript save failed. Check your connection."); })
        .catch(() => setStatus("Transcript save failed. Check your connection."));
    }
    return message;
  }, []);

  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window) || !text) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = level === "Beginner" ? 0.88 : 0.98;
    utterance.onstart = () => setStatus("Speaking");
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  }), [level]);

  const requestReply = useCallback(async (learnerText: string) => {
    if (busyRef.current || !learnerText.trim()) return;
    busyRef.current = true; setBusy(true); setStatus("Thinking");
    try {
      const next = [...messagesRef.current, { id: newId(), role: "user" as const, content: learnerText.trim(), createdAt: new Date().toISOString() }];
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "conversation",
          scenario: topic === "Random Topic" ? "Free conversation" : topic === "Software Development" ? "Explain a technical concept" : topic === "Work and Meetings" ? "Team meeting" : topic === "Food and Cooking" ? "Restaurant conversation" : topic === "Daily Life" ? "Everyday life" : topic === "Travel" ? "Travel and directions" : topic === "Custom Topic" ? (customTopic.trim() || "Free conversation") : "Free conversation",
          difficulty: level,
          feedbackStyle: "gentle",
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!response.ok || !response.body) throw new Error("The conversation service is unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            const parsed = JSON.parse(raw) as { message?: { content?: string }; response?: string; content?: string };
            reply += parsed.message?.content ?? parsed.response ?? parsed.content ?? "";
          } catch { /* ignore non-JSON keepalive lines */ }
        }
      }
      if (!reply.trim()) throw new Error("The AI returned an empty response.");
      append("user", learnerText);
      append("assistant", reply.trim());
      setStatus("Speaking");
      await speak(reply.trim());
      if (shouldListenRef.current) startListening();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Conversation failed. Please try again.");
      if (shouldListenRef.current) window.setTimeout(() => startListening(), 1200);
    } finally {
      busyRef.current = false; setBusy(false);
    }
  // startListening is intentionally declared below and referenced through a stable function.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [append, customTopic, level, speak, topic]);

  const startListening = useCallback(() => {
    if (!shouldListenRef.current || busyRef.current) return;
    const recognitionConstructor = (window as RecognitionWindow).SpeechRecognition ?? (window as RecognitionWindow).webkitSpeechRecognition;
    if (!recognitionConstructor) { setStatus("Voice input is not supported in this browser. You can still use text input."); return; }
    try {
      recognitionRef.current?.abort();
      const recognition = new recognitionConstructor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      let finalTranscript = "";
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) finalTranscript += result[0].transcript;
          else interim += result[0].transcript;
        }
        if (interim) setStatus(`Listening: ${interim.slice(0, 60)}`);
        if (finalTranscript.trim()) {
          const text = finalTranscript.trim();
          finalTranscript = "";
          shouldListenRef.current = true;
          void requestReply(text);
        }
      };
      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          shouldListenRef.current = false; setActive(false); setStatus("Microphone permission denied. Allow microphone access in browser settings.");
        } else if (event.error !== "aborted" && shouldListenRef.current) setStatus("Reconnecting to microphone…");
      };
      recognition.onend = () => {
        if (shouldListenRef.current && !busyRef.current) window.setTimeout(() => startListening(), 300);
      };
      recognitionRef.current = recognition;
      setStatus("Listening");
      recognition.start();
    } catch { setStatus("Could not start the microphone. Check browser permissions."); }
  }, [requestReply]);

  const stopSession = useCallback(async () => {
    shouldListenRef.current = false;
    setActive(false); setBusy(false); busyRef.current = false;
    recognitionRef.current?.stop(); recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    setStatus("Finalizing transcript and generating feedback…");
    setFeedbackStatus("processing");
    try {
      const response = await fetch("/api/voice-conversations/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, topic, proficiency: level, durationSeconds: elapsed, messages: messagesRef.current }),
      });
      const data = await response.json() as { feedback?: Array<Record<string, unknown>>; feedbackStatus?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Feedback could not be generated.");
      setFeedback(data.feedback ?? []);
      setFeedbackStatus(data.feedbackStatus === "complete" ? "complete" : "partial");
      setTab("feedback");
      setStatus(data.feedbackStatus === "complete" ? "Conversation complete" : "Feedback partially available");
    } catch (error) {
      setFeedbackStatus("failed"); setStatus(error instanceof Error ? error.message : "Feedback generation failed.");
    }
  }, [elapsed, level, sessionId, topic]);

  const startSession = useCallback(async () => {
    setMessages([]); setFeedback([]); setFeedbackStatus("idle"); setElapsed(0); setTab("conversation");
    const nextSessionId = newId();\n    sessionIdRef.current = nextSessionId; setSessionId(nextSessionId); transcriptSequenceRef.current = 0;\n    startedAtRef.current = Date.now();
    setActive(true); setOpen(true); setMinimized(false); shouldListenRef.current = true;
    append("assistant", `Hello! I'm your AI English Partner. Let's practice ${topic === "Random Topic" ? "a fun topic" : topic === "Custom Topic" ? (customTopic || "your chosen topic") : topic}. I'll speak at a ${level.toLowerCase()} level. What do you think about it?`);
    await speak(`Hello! I'm your AI English Partner. Let's practice ${topic === "Random Topic" ? "a fun topic" : topic === "Custom Topic" ? (customTopic || "your chosen topic") : topic}. I'll speak at a ${level.toLowerCase()} level. What do you think about it?`);
    startListening();
  }, [append, customTopic, level, speak, startListening, topic]);

  const copyText = (value: unknown) => { if (typeof value === "string") void navigator.clipboard?.writeText(value); };
  const time = `${Math.floor(elapsed / 60).toString().padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`;

  return (
    <>
      <button className="floating-english-trigger" type="button" aria-label="Open AI English Partner" aria-expanded={open} onClick={() => { setOpen(true); setMinimized(false); }}>
        <span aria-hidden="true">✦</span><span className="floating-english-trigger-label">Speak English</span>
      </button>
      {open && <section className={`floating-english-panel ${minimized ? "is-minimized" : ""}`} role="dialog" aria-label="AI English Partner" aria-modal="false">
        <header className="floating-english-header">
          <div className="floating-english-brand"><span className="floating-english-mark">✦</span><div><strong>AI English Partner</strong><small>{active ? status : "Practice speaking, naturally"}</small></div></div>
          <div className="floating-english-header-actions">
            <button type="button" aria-label="Minimize conversation" onClick={() => setMinimized((v) => !v)}>{minimized ? "□" : "−"}</button>
            <button type="button" aria-label="Close conversation window" onClick={() => setOpen(false)}>×</button>
          </div>
        </header>
        {!minimized && <>
          <div className="floating-english-settings">
            <label>Topic<select value={topic} onChange={(event) => setTopic(event.target.value)} disabled={active}>{TOPICS.map((item) => <option key={item}>{item}</option>)}</select></label>
            {topic === "Custom Topic" && <label>Custom topic<input value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} disabled={active} maxLength={120} placeholder="e.g. explaining a software release" /></label>}
            <label>English level<select value={level} onChange={(event) => setLevel(event.target.value as (typeof LEVELS)[number])} disabled={active}>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="floating-english-status"><span className={active ? "live-dot" : ""} />{active ? status : status}<span className="floating-english-timer">{time}</span></div>
          {tab === "conversation" ? <div className="floating-english-transcript" ref={scrollRef} aria-live="polite">
            {messages.length === 0 && <div className="floating-english-empty"><span>✦</span><strong>Let's build confidence together.</strong><p>Start a conversation and speak naturally. You can interrupt, pause, or stop whenever you like.</p></div>}
            {messages.map((message) => <article key={message.id} className={`floating-english-message ${message.role}`}><small>{message.role === "user" ? "You" : "AI Partner"} · {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small><p>{message.content}</p></article>)}
          </div> : <div className="floating-english-feedback" aria-live="polite">
            {feedbackStatus === "processing" && <p>Analyzing each sentence in order. Please keep this window open.</p>}
            {feedbackStatus === "failed" && <p>Feedback could not be completed. Your transcript remains available in this window; stop again to retry.</p>}
            {feedbackStatus === "partial" && <p>Some feedback is available. The report is marked partial, not complete.</p>}
            {feedbackStatus === "complete" && <p className="feedback-success">All eligible learner utterances have feedback.</p>}
            {feedback.map((item, index) => <details className="floating-english-feedback-item" key={String(item.messageId ?? index)} open={index === 0}><summary>{String(item.originalSentence ?? "Sentence")} {item.isCorrect ? "✓" : "•"}</summary><p><strong>Original:</strong> {String(item.originalSentence ?? "")}</p><p><strong>Corrected:</strong> {String(item.correctedSentence ?? "")}</p>{item.naturalSentence && <p><strong>Natural:</strong> {String(item.naturalSentence)}</p>}<p><strong>Why:</strong> {String(item.explanation ?? "")}</p><p><strong>Category:</strong> {Array.isArray(item.errorCategories) ? item.errorCategories.join(", ") : "—"} · <strong>Severity:</strong> {String(item.severity ?? "—")}</p><button type="button" onClick={() => copyText(item.correctedSentence)}>Copy corrected sentence</button></details>)}
          </div>}
          <footer className="floating-english-controls">
            {!active ? <button className="floating-english-start" type="button" onClick={() => void startSession()} disabled={busy}>Start Conversation</button> : <button className="floating-english-stop" type="button" onClick={() => void stopSession()}>Stop Conversation</button>}
            {feedbackStatus !== "idle" && <button type="button" onClick={() => setTab((value) => value === "conversation" ? "feedback" : "conversation")}>{tab === "feedback" ? "Conversation" : "Review feedback"}</button>}
          </footer>
        </>}
      </section>}
    </>
  );
}
