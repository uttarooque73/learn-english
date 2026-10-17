"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import { speakText, stopSpeaking } from "@/lib/speech-playback";

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
  const [tab, setTab] = useState<"conversation" | "feedback" | "history">("conversation");
  const [feedback, setFeedback] = useState<Array<Record<string, unknown>>>([]);
  const [overallFeedback, setOverallFeedback] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [sentenceFeedbackEnabled, setSentenceFeedbackEnabled] = useState(true);
  const [repeatAfterFeedbackEnabled, setRepeatAfterFeedbackEnabled] = useState(true);
  const [sentenceFeedbackByMessage, setSentenceFeedbackByMessage] = useState<Record<string, Record<string, unknown>>>({});
  const [practiceResult, setPracticeResult] = useState<Record<string, string>>({});
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "processing" | "complete" | "partial" | "failed">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const sessionIdRef = useRef("");
  const transcriptSequenceRef = useRef(0);
  const recognitionRef = useRef<Recognition | null>(null);
  const activeRef = useRef(false);
  const shouldListenRef = useRef(false);
  const busyRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const startedAtRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stopSessionRef = useRef<(() => void) | null>(null);
  const startListeningRef = useRef<(() => void) | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => { messagesRef.current = messages; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    void fetch("/api/voice-conversations/preferences", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { sentenceFeedbackEnabled?: boolean; repeatAfterFeedbackEnabled?: boolean };
        if (response.ok) {
          if (typeof data.sentenceFeedbackEnabled === "boolean") setSentenceFeedbackEnabled(data.sentenceFeedbackEnabled);
          if (typeof data.repeatAfterFeedbackEnabled === "boolean") setRepeatAfterFeedbackEnabled(data.repeatAfterFeedbackEnabled);
        }
      })
      .catch(() => setStatus("Preferences could not be loaded; using defaults."));
  }, []);
  const savePreferences = useCallback(async (nextSentenceFeedback: boolean, nextRepeat: boolean) => {
    setSentenceFeedbackEnabled(nextSentenceFeedback);
    setRepeatAfterFeedbackEnabled(nextRepeat);
    setPreferencesSaving(true);
    try {
      const response = await fetch("/api/voice-conversations/preferences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentenceFeedbackEnabled: nextSentenceFeedback, repeatAfterFeedbackEnabled: nextRepeat }),
      });
      if (!response.ok) throw new Error("Preferences could not be saved.");
    } catch {
      setStatus("Could not save preferences. Please try again.");
    } finally {
      setPreferencesSaving(false);
    }
  }, []);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => () => {
    shouldListenRef.current = false;
    recognitionRef.current?.abort();
    stopSpeaking();
  }, []);

  const append = useCallback((role: Role, content: string) => {
    const message = { id: newId(), role, content: content.trim(), createdAt: new Date().toISOString() };
    if (!message.content) return null;
    messagesRef.current = [...messagesRef.current, message];
    setMessages(messagesRef.current);
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

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    // Load the same database-backed preferences used by Listen buttons and Conversation Coach.
    try {
      await initializeDatabasePersistence();
    } catch {
      // Keep speech available with the preferences already in memory if persistence is temporarily unavailable.
    }
    setStatus("Speaking");
    await new Promise<void>((resolve) => {
      if (!speakText(text, resolve)) resolve();
    });
  }, []);

  const requestReply = useCallback(async (learnerText: string) => {
    if (busyRef.current || !learnerText.trim()) return;
    busyRef.current = true; setBusy(true); setStatus("Thinking");
    const controller = new AbortController();
    requestAbortRef.current = controller;
    try {
      const learnerMessage = append("user", learnerText);
      if (!learnerMessage) return;
      if (sentenceFeedbackEnabled && sessionIdRef.current) {
        try {
          const feedbackResponse = await fetch("/api/voice-conversations/sentence-feedback", {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({
              sessionId: sessionIdRef.current, topic, proficiency: level,
              startedAt: new Date(startedAtRef.current).toISOString(),
              sequenceNumber: Math.max(0, transcriptSequenceRef.current - 1),
              message: learnerMessage,
            }),
          });
          const feedbackData = await feedbackResponse.json() as { feedback?: Record<string, unknown>; error?: string };
          if (feedbackResponse.ok && feedbackData.feedback) {
            setSentenceFeedbackByMessage((current) => ({ ...current, [learnerMessage.id]: feedbackData.feedback! }));
            setStatus("Sentence feedback ready");
          } else {
            setStatus(feedbackData.error || "Sentence feedback is unavailable; continuing conversation.");
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") throw error;
          setStatus("Sentence feedback is unavailable; continuing conversation.");
        }
      }
      const next = messagesRef.current.map(({ role, content }) => ({ role, content }));
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode: "conversation",
          scenario: topic === "Random Topic" ? "Free conversation" : topic === "Software Development" ? "Explain a technical concept" : topic === "Work and Meetings" ? "Team meeting" : topic === "Food and Cooking" ? "Restaurant conversation" : topic === "Daily Life" ? "Everyday life" : topic === "Travel" ? "Travel and directions" : topic === "Custom Topic" ? (customTopic.trim() || "Free conversation") : "Free conversation",
          difficulty: level,
          feedbackStyle: "gentle",
          messages: next,
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
      append("assistant", reply.trim());
      setStatus("Speaking");
      await speak(reply.trim());
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setStatus(error instanceof Error ? error.message : "Conversation failed. Please try again.");
    } finally {
      requestAbortRef.current = null;
      busyRef.current = false; setBusy(false);
      if (shouldListenRef.current) window.setTimeout(() => startListeningRef.current?.(), 180);
    }
  }, [append, customTopic, level, sentenceFeedbackEnabled, speak, topic]);

  const startListening = useCallback(() => {
    if (!shouldListenRef.current || busyRef.current || recognitionRef.current) return;
    const recognitionConstructor = (window as RecognitionWindow).SpeechRecognition ?? (window as RecognitionWindow).webkitSpeechRecognition;
    if (!recognitionConstructor) { setStatus("Voice input is not supported in this browser. You can still use text input."); return; }
    try {
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
          if (/^(please\s+)?(stop|end|finish)(\s+(the\s+)?(conversation|session))?(\s+now)?(\s+please)?[.! ]*$/i.test(text)) {
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
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        if (shouldListenRef.current && !busyRef.current) window.setTimeout(() => startListeningRef.current?.(), 300);
      };
      recognitionRef.current = recognition;
      setStatus("Listening");
      recognition.start();
    } catch { recognitionRef.current = null; setStatus("Could not start the microphone. Check browser permissions."); }
  }, [requestReply]);

  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  const stopSession = useCallback(async () => {
    shouldListenRef.current = false;
    activeRef.current = false;
    requestAbortRef.current?.abort(); requestAbortRef.current = null;
    setActive(false); setBusy(false); busyRef.current = false;
    recognitionRef.current?.stop(); recognitionRef.current = null;
    stopSpeaking();
    setStatus("Finalizing transcript and generating feedback…");
    setFeedbackStatus("processing");
    try {
      const response = await fetch("/api/voice-conversations/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, topic, proficiency: level, durationSeconds: elapsed, messages: messagesRef.current }),
      });
      const data = await response.json() as { feedback?: Array<Record<string, unknown>>; feedbackStatus?: string; overallFeedback?: Record<string, unknown>; error?: string };
      if (!response.ok) throw new Error(data.error || "Feedback could not be generated.");
      setFeedback(data.feedback ?? []);
      setSentenceFeedbackByMessage(Object.fromEntries((data.feedback ?? []).map((item) => [String(item.messageId ?? ""), item])));
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
      setSentenceFeedbackByMessage(Object.fromEntries((data.feedback ?? []).map((item) => [String(item.messageId ?? ""), item])));
      setPracticeResult({});
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

  const practiceCorrectedSentence = useCallback(async (messageId: string, target: string) => {
    shouldListenRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    stopSpeaking();
    setPracticeResult((current) => ({ ...current, [messageId]: "Listen to the corrected sentence, then repeat it aloud." }));
    await speak(target);
    const recognitionConstructor = (window as RecognitionWindow).SpeechRecognition ?? (window as RecognitionWindow).webkitSpeechRecognition;
    if (!recognitionConstructor) {
      shouldListenRef.current = activeRef.current;
      setPracticeResult((current) => ({ ...current, [messageId]: "Repeat the sentence aloud. Speech recognition is not supported in this browser." }));
      return;
    }
    setPracticeResult((current) => ({ ...current, [messageId]: "Listening for your repetition…" }));
    const recognition = new recognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript ?? "";
      const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();
      const expectedWords = normalize(target).split(" ").filter(Boolean);
      const spokenWords = normalize(spoken).split(" ").filter(Boolean);
      const matched = expectedWords.filter((word) => spokenWords.includes(word)).length;
      const similarity = matched / Math.max(expectedWords.length, spokenWords.length, 1);
      setPracticeResult((current) => ({
        ...current,
        [messageId]: similarity >= 0.75
          ? `Good repetition! You said: “${spoken}”`
          : `Keep practicing. You said: “${spoken}”. Try to match: “${target}”`,
      }));
      shouldListenRef.current = activeRef.current;
    };
    recognition.onerror = () => {
      setPracticeResult((current) => ({ ...current, [messageId]: "I couldn't capture that repetition. Please try again." }));
      shouldListenRef.current = activeRef.current;
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (shouldListenRef.current && activeRef.current && !busyRef.current) window.setTimeout(() => startListeningRef.current?.(), 250);
    };
    recognitionRef.current = recognition;
    try { recognition.start(); }
    catch {
      recognitionRef.current = null;
      shouldListenRef.current = activeRef.current;
      setPracticeResult((current) => ({ ...current, [messageId]: "Microphone could not start. Check browser permissions and try again." }));
    }
  }, [speak]);

  const interruptSpeech = useCallback(() => {
    stopSpeaking();
    setStatus("Speech interrupted");
    if (active) {
      shouldListenRef.current = true;
      if (!busyRef.current) window.setTimeout(() => { if (!busyRef.current && shouldListenRef.current) startListeningRef.current?.(); }, 150);
    }
  }, [active]);

  const startSession = useCallback(async () => {
    setMessages([]); messagesRef.current = []; setFeedback([]); setSentenceFeedbackByMessage({}); setPracticeResult({}); setOverallFeedback(null); setFeedbackStatus("idle"); setElapsed(0); setTab("conversation");
    const nextSessionId = newId();
    sessionIdRef.current = nextSessionId; setSessionId(nextSessionId); transcriptSequenceRef.current = 0;
    startedAtRef.current = Date.now();
    activeRef.current = true;
    setActive(true); setOpen(true); setMinimized(false); shouldListenRef.current = true;
    append("assistant", `Hello! I'm Lexi, your AI English Partner. Let's practice ${topic === "Random Topic" ? "a fun topic" : topic === "Custom Topic" ? (customTopic || "your chosen topic") : topic}. I'll speak at a ${level.toLowerCase()} level. What do you think about it?`);
    await speak(`Hello! I'm Lexi, your AI English Partner. Let's practice ${topic === "Random Topic" ? "a fun topic" : topic === "Custom Topic" ? (customTopic || "your chosen topic") : topic}. I'll speak at a ${level.toLowerCase()} level. What do you think about it?`);
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
          <div className="floating-english-brand"><span className="floating-english-mark">✦</span><div><strong>Lexi · AI English Partner</strong><small>{active ? status : "Practice speaking, naturally"}</small></div></div>
          <div className="floating-english-header-actions">
            <button type="button" aria-label="Minimize conversation" onClick={() => setMinimized((v) => !v)}>{minimized ? "□" : "−"}</button>
            <button type="button" aria-label="Close conversation window" onClick={() => { if (active) void stopSession(); setOpen(false); }}>×</button>
          </div>
        </header>
        {!minimized && <>
          <div className="floating-english-settings">
            <label>Topic<select value={topic} onChange={(event) => setTopic(event.target.value)} disabled={active}>{TOPICS.map((item) => <option key={item}>{item}</option>)}</select></label>
            {topic === "Custom Topic" && <label>Custom topic<input value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} disabled={active} maxLength={120} placeholder="e.g. explaining a software release" /></label>}
            <label>English level<select value={level} onChange={(event) => setLevel(event.target.value as (typeof LEVELS)[number])} disabled={active}>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="floating-english-preference-toggles">
            <label><input type="checkbox" checked={sentenceFeedbackEnabled} disabled={active || preferencesSaving} onChange={(event) => void savePreferences(event.target.checked, repeatAfterFeedbackEnabled)} /> Feedback after every sentence</label>
            <label><input type="checkbox" checked={repeatAfterFeedbackEnabled} disabled={active || preferencesSaving || !sentenceFeedbackEnabled} onChange={(event) => void savePreferences(sentenceFeedbackEnabled, event.target.checked)} /> Enable repeat practice after feedback</label>
            {preferencesSaving && <small>Saving preferences…</small>}
          </div>
          <div className="floating-english-status"><span className={active ? "live-dot" : ""} />{active ? status : status}<span className="floating-english-timer">{time}</span></div>
          {tab === "conversation" ? <div className="floating-english-transcript" ref={scrollRef} aria-live="polite">
            {messages.length === 0 && <div className="floating-english-empty"><span>✦</span><strong>Let&apos;s build confidence together.</strong><p>Start a conversation and speak naturally. You can interrupt, pause, or stop whenever you like.</p></div>}
            {messages.map((message) => <div key={message.id}>
              <article className={`floating-english-message ${message.role}`}><small>{message.role === "user" ? "You" : "AI Partner"} · {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small><p>{message.content}</p></article>
              {message.role === "user" && sentenceFeedbackByMessage[message.id] && <section className="floating-english-inline-feedback" aria-live="polite">
                <strong>Sentence feedback</strong>
                <p><b>Corrected:</b> {String(sentenceFeedbackByMessage[message.id].correctedSentence ?? message.content)}</p>
                {typeof sentenceFeedbackByMessage[message.id].naturalSentence === "string" && String(sentenceFeedbackByMessage[message.id].naturalSentence).length > 0 && <p><b>More natural:</b> {String(sentenceFeedbackByMessage[message.id].naturalSentence)}</p>}
                <p><b>Why:</b> {String(sentenceFeedbackByMessage[message.id].explanation ?? "")}</p>
                {repeatAfterFeedbackEnabled && <button type="button" onClick={() => void practiceCorrectedSentence(message.id, String(sentenceFeedbackByMessage[message.id].correctedSentence ?? message.content))}>Practice corrected sentence</button>}
                {practiceResult[message.id] && <p role="status">{practiceResult[message.id]}</p>}
              </section>}
            </div>)}
          </div> : tab === "feedback" ? <div className="floating-english-feedback" aria-live="polite">
            {overallFeedback && <section className="floating-english-overall-feedback">
              <strong>Overall feedback</strong>
              <p>Analyzed {String(overallFeedback.analyzedUtterances ?? 0)} of {String(overallFeedback.totalUtterances ?? 0)} learner utterances; {String(overallFeedback.correctUtterances ?? 0)} were marked correct.</p>
              {Array.isArray(overallFeedback.strengths) && overallFeedback.strengths.length > 0 && <p><strong>Strengths:</strong> {overallFeedback.strengths.map(String).join(" · ")}</p>}
              {Array.isArray(overallFeedback.frequentErrors) && overallFeedback.frequentErrors.length > 0 && <p><strong>Frequent patterns:</strong> {(overallFeedback.frequentErrors as Array<Record<string, unknown>>).map((item) => `${String(item.category)} (${String(item.count)})`).join(", ")}</p>}
              {Array.isArray(overallFeedback.recommendations) && overallFeedback.recommendations.length > 0 && <p><strong>Practice next:</strong> {(overallFeedback.recommendations as string[]).join(" ")}</p>}
              {Array.isArray(overallFeedback.usefulExpressions) && overallFeedback.usefulExpressions.length > 0 && <p><strong>Useful expressions:</strong> {overallFeedback.usefulExpressions.map(String).join(" · ")}</p>}
            </section>}
            {feedbackStatus === "processing" && <p>Analyzing each sentence in order. Please keep this window open.</p>}
            {feedbackStatus === "failed" && <p>Feedback could not be completed. Your transcript remains available in this window; stop again to retry.</p>}
            {feedbackStatus === "partial" && <p>Some feedback is available. The report is marked partial, not complete.</p>}
            {feedbackStatus === "complete" && <p className="feedback-success">All eligible learner utterances have feedback.</p>}
            {feedback.map((item, index) => <details className="floating-english-feedback-item" key={String(item.messageId ?? index)} open={index === 0}><summary>{String(item.originalSentence ?? "Sentence")} {item.isCorrect ? "✓" : "•"}</summary><p><strong>Original:</strong> {String(item.originalSentence ?? "")}</p><p><strong>Corrected:</strong> {String(item.correctedSentence ?? "")}</p>{typeof item.naturalSentence === "string" && item.naturalSentence && <p><strong>Natural:</strong> {item.naturalSentence}</p>}<p><strong>Why:</strong> {String(item.explanation ?? "")}</p><p><strong>Category:</strong> {Array.isArray(item.errorCategories) ? item.errorCategories.join(", ") : "—"} · <strong>Severity:</strong> {String(item.severity ?? "—")}</p><button type="button" onClick={() => copyText(item.correctedSentence)}>Copy corrected sentence</button></details>)}
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
            {!active && (feedbackStatus === "failed" || feedbackStatus === "partial") && <button type="button" onClick={() => void stopSession()}>Retry feedback</button>}
            <button type="button" onClick={() => { setTab("history"); void loadHistory(); }} disabled={active}>History</button>
            {tab !== "conversation" && <button type="button" onClick={() => setTab("conversation")}>Conversation</button>}
            {tab !== "feedback" && feedbackStatus !== "idle" && <button type="button" onClick={() => setTab("feedback")}>Review feedback</button>}
          </footer>
        </>}
      </section>}
    </>
  );
}
