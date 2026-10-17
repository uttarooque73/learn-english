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
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [topic, setTopic] = useState("Random Topic");
  const [customTopic, setCustomTopic] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Intermediate");
  const [tab, setTab] = useState<"conversation" | "feedback">("conversation");
  const [feedback, setFeedback] = useState<Array<Record<string, unknown>>>([]);
  const [overallFeedback, setOverallFeedback] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
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
  const stopSessionRef = useRef<(() => void) | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

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
  }, [level, topic]);

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
    const controller = new AbortController();
    requestAbortRef.current = controller;
    try {
      const next = [...messagesRef.current, { id: newId(), role: "user" as const, content: learnerText.trim(), createdAt: new Date().toISOString() }];
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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
        reply += decoder.decode(value, { stream: !done });
        if (done) break;
      }
      if (!reply.trim()) throw new Error("The AI returned an empty response.");
      append("user", learnerText);
      append("assistant", reply.trim());
      setStatus("Speaking");
      await speak(reply.trim());
      if (shouldListenRef.current) startListening();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setStatus(error instanceof Error ? error.message : "Conversation failed. Please try again.");
      if (shouldListenRef.current) window.setTimeout(() => startListening(), 1200);
    } finally {
      requestAbortRef.current = null;
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
          if (/^(please\\s+)?(stop|end|finish)(\\s+(the\\s+)?(conversation|session))?(\\s+now)?(\\s+please)?[.! ]*$/i.test(text)) {
            const stop = stopSessionRef.current;
            if (stop) stop();
            return;
          }
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
    requestAbortRef.current?.abort(); requestAbortRef.current = null;
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
      setOverallFeedback((data.overallFeedback as Record<string, unknown> | undefined) ?? null);
      setFeedbackStatus(data.feedbackStatus === "complete" ? "complete" : data.feedbackStatus === "failed" ? "failed" : "partial");
      setTab("feedback");
      setStatus(data.feedbackStatus === "complete" ? "Conversation complete" : "Feedback partially available");
    } catch (error) {
      setFeedbackStatus("failed"); setStatus(error instanceof Error ? error.message : "Feedback generation failed.");
    }
  }, [elapsed, level, sessionId, topic]);

  useEffect(() => { stopSessionRef.current = () => { void stopSession(); }; }, [stopSession]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/voice-conversations/session", { cache: "no-store" });
      const data = await response.json() as { sessions?: Array<Record<string, unknown>>; error?: string };
      if (!response.ok) throw new Error(data.error || "Conversation history could not be loaded.");
      setHistory(data.sessions ?? []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Conversation history could not be loaded.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistorySession = useCallback(async (id: string) => {
    setStatus("Loading saved conversation…");
    try {
      const response = await fetch(`/api/voice-conversations/feedback?sessionId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json() as {
        session?: Record<string, unknown>;
        messages?: Message[];
        feedback?: Array<Record<string, unknown>>;
        error?: string;
      };
      if (!response.ok || !data.session) throw new Error(data.error || "Saved conversation could not be opened.");
      const savedMessages = data.messages ?? [];
      sessionIdRef.current = id;
      setSessionId(id);
      transcriptSequenceRef.current = savedMessages.length;
      setMessages(savedMessages);
      messagesRef.current = savedMessages;
      setFeedback(data.feedback ?? []);
      setOverallFeedback((data.session.overallFeedback as Record<string, unknown> | null) ?? null);
      setTopic(typeof data.session.topic === "string" ? data.session.topic : "Random Topic");
      setLevel(LEVELS.includes(data.session.proficiency as (typeof LEVELS)[number]) ? data.session.proficiency as (typeof LEVELS)[number] : "Intermediate");
      setElapsed(typeof data.session.durationSeconds === "number" ? data.session.durationSeconds : 0);
      const savedStatus = String(data.session.feedbackStatus ?? "idle");
      setFeedbackStatus(savedStatus === "complete" ? "complete" : savedStatus === "partial" ? "partial" : savedStatus === "failed" ? "failed" : "idle");
      setActive(false);
      setTab("conversation");
      setStatus("Saved conversation loaded");
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Saved conversation could not be opened.");
    }
  }, []);

  useEffect(() => {
    if (open && tab === "history") void loadHistory();
  }, [loadHistory, open, tab]);

  const interruptSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setStatus("Speech interrupted");
    if (active) {
      shouldListenRef.current = true;
      window.setTimeout(() => { if (!busyRef.current && shouldListenRef.current) startListening(); }, 400);
    }
  }, [active, startListening]);

  const startSession = useCallback(async () => {
    setMessages([]); messagesRef.current = []; setFeedback([]); setOverallFeedback(null); setFeedbackStatus("idle"); setElapsed(0); setTab("conversation");
    const nextSessionId = newId();
    sessionIdRef.current = nextSessionId; setSessionId(nextSessionId); transcriptSequenceRef.current = 0;
    startedAtRef.current = Date.now();
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
          </div> : tab === "feedback" ? <div className="floating-english-feedback" aria-live="polite">
            {overallFeedback && <section className="floating-english-overall-feedback"><strong>Overall feedback</strong><p>Analyzed {String(overallFeedback.analyzedUtterances ?? 0)} of {String(overallFeedback.totalUtterances ?? 0)} learner utterances; {String(overallFeedback.correctUtterances ?? 0)} were marked correct.</p>{Array.isArray(overallFeedback.frequentErrors) && overallFeedback.frequentErrors.length > 0 && <p><strong>Frequent patterns:</strong> {(overallFeedback.frequentErrors as Array<Record<string, unknown>>).map((item) => `${String(item.category)} (${String(item.count)})`).join(", ")}</p>}{Array.isArray(overallFeedback.recommendations) && overallFeedback.recommendations.length > 0 && <p><strong>Practice next:</strong> {(overallFeedback.recommendations as string[]).join(" ")}</p>}</section>}
            {feedbackStatus === "processing" && <p>Analyzing each sentence in order. Please keep this window open.</p>}
            {feedbackStatus === "failed" && <p>Feedback could not be completed. Your transcript remains available in this window; stop again to retry.</p>}
            {feedbackStatus === "partial" && <p>Some feedback is available. The report is marked partial, not complete.</p>}
            {feedbackStatus === "complete" && <p className="feedback-success">All eligible learner utterances have feedback.</p>}
            {feedback.map((item, index) => <details className="floating-english-feedback-item" key={String(item.messageId ?? index)} open={index === 0}><summary>{String(item.originalSentence ?? "Sentence")} {item.isCorrect ? "✓" : "•"}</summary><p><strong>Original:</strong> {String(item.originalSentence ?? "")}</p><p><strong>Corrected:</strong> {String(item.correctedSentence ?? "")}</p>{item.naturalSentence && <p><strong>Natural:</strong> {String(item.naturalSentence)}</p>}<p><strong>Why:</strong> {String(item.explanation ?? "")}</p><p><strong>Category:</strong> {Array.isArray(item.errorCategories) ? item.errorCategories.join(", ") : "—"} · <strong>Severity:</strong> {String(item.severity ?? "—")}</p><button type="button" onClick={() => copyText(item.correctedSentence)}>Copy corrected sentence</button></details>)}
          </div> : <div className="floating-english-history" aria-live="polite">
            {historyLoading && <p>Loading saved conversations…</p>}
            {historyError && <p role="alert">{historyError}</p>}
            {!historyLoading && history.length === 0 && !historyError && <p>No saved conversations yet.</p>}
            {history.map((item) => <button className="floating-english-history-item" type="button" key={String(item.id)} onClick={() => void openHistorySession(String(item.id))}><strong>{String(item.topic ?? "Conversation")}</strong><span>{String(item.proficiency ?? "Intermediate")} · {String(item.startedAt ?? "")}</span><small>Feedback: {String(item.feedbackStatus ?? "pending")}</small></button>)}
          </div>}
          {active && tab === "conversation" && <form className="floating-english-composer" onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text || busyRef.current) return;
            setDraft("");
            shouldListenRef.current = false;
            recognitionRef.current?.abort(); recognitionRef.current = null;
            void requestReply(text);
          }}>
            <label htmlFor="floating-english-message-input">Type a message</label>
            <div><input id="floating-english-message-input" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder="Speak or type your answer…" disabled={busy} /><button type="submit" disabled={busy || !draft.trim()}>Send</button></div>
          </form>}
          <footer className="floating-english-controls">
            {!active ? <button className="floating-english-start" type="button" onClick={() => void startSession()} disabled={busy}>Start Conversation</button> : <><button type="button" onClick={interruptSpeech}>Interrupt speech</button><button className="floating-english-stop" type="button" onClick={() => void stopSession()}>Stop Conversation</button></>}
            {!active && feedbackStatus !== "idle" && feedbackStatus !== "processing" && <button type="button" onClick={() => void stopSession()}>Retry feedback</button>}
            <button type="button" onClick={() => setTab("history")}>History</button>
            {tab !== "conversation" && <button type="button" onClick={() => setTab("conversation")}>Conversation</button>}
            {tab !== "feedback" && feedbackStatus !== "idle" && <button type="button" onClick={() => setTab("feedback")}>Review feedback</button>}
          </footer>
        </>}
      </section>}
    </>
  );
}
