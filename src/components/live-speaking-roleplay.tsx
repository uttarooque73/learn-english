"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListenButton } from "@/components/listen-button";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import { upsertSession, type PracticeMessage, type PracticeSession } from "@/lib/learning-storage";
import styles from "./live-speaking-roleplay.module.css";

type Scenario = { id: string; title: string; role: string; description: string; opening: string; icon: string };
type SpeechResult = { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }>; resultIndex: number };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: SpeechResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void };
type RecognitionWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

const SCENARIOS: Scenario[] = [
  { id: "standup", title: "Team stand-up", role: "a friendly software teammate", description: "Share yesterday's work, today's plan, and blockers.", opening: "Start a realistic daily stand-up. Ask what I worked on yesterday.", icon: "↗" },
  { id: "interview", title: "Job interview", role: "a supportive interviewer", description: "Answer interview questions and practise follow-ups.", opening: "Start a realistic job interview with one common opening question.", icon: "✦" },
  { id: "presentation", title: "Project presentation", role: "a curious colleague", description: "Explain an idea, handle questions, and clarify details.", opening: "Ask me to introduce a project I am working on, then ask natural follow-up questions.", icon: "▤" },
  { id: "everyday", title: "Everyday conversation", role: "a friendly conversation partner", description: "Build confidence with natural, low-pressure conversation.", opening: "Start a relaxed everyday conversation with a simple question.", icon: "☕" },
  { id: "client", title: "Client discussion", role: "a professional client", description: "Clarify requirements, explain trade-offs, and agree on next steps.", opening: "Begin a client meeting by asking for a brief project update.", icon: "◎" },
];

function getRecognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as RecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function elapsedLabel(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function LiveSpeakingRoleplay() {
  const [scenarioId, setScenarioId] = useState("standup");
  const [difficulty, setDifficulty] = useState("Intermediate");
  const [duration, setDuration] = useState(5);
  const [messages, setMessages] = useState<PracticeMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [active, setActive] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [persistenceReady, setPersistenceReady] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const messagesRef = useRef<PracticeMessage[]>([]);
  const startedAtRef = useRef("");
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];

  useEffect(() => {
    let mounted = true;
    void initializeDatabasePersistence().catch(() => undefined).finally(() => { if (mounted) setPersistenceReady(true); });
    return () => { mounted = false; recognitionRef.current?.abort(); };
  }, []);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const started = Date.parse(startedAtRef.current);
      if (Number.isFinite(started)) {
        const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
        setElapsed(seconds);
        if (seconds >= duration * 60) {
          setActive(false);
          recognitionRef.current?.stop();
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, duration]);

  const saveCurrentSession = useCallback((nextMessages: PracticeMessage[], id: string, ended = false) => {
    if (!id || !startedAtRef.current) return;
    const now = new Date().toISOString();
    const learnerMessages = nextMessages.filter((item) => item.role === "user").map((item) => item.content);
    const session: PracticeSession = {
      id,
      scenario: `Live roleplay: ${scenario.title}`,
      goal: "Build speaking confidence through realistic roleplay",
      durationLimitMinutes: duration,
      startedAt: startedAtRef.current,
      updatedAt: now,
      durationSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(startedAtRef.current)) / 1000)),
      messageCount: nextMessages.length,
      learnerMessages,
      messages: nextMessages,
      ...(ended ? { summary: undefined } : {}),
    };
    upsertSession(session);
  }, [duration, scenario.title]);

  async function askTutor(nextMessages: PracticeMessage[], firstTurn = false) {
    const systemContext = [
      "You are a live English speaking roleplay partner inside SpeakUp AI.",
      `Stay in character as ${scenario.role} in this scenario: ${scenario.title}.`,
      `Learner level: ${difficulty}. Use language appropriate to this level.`,
      "Respond naturally in 1-3 short sentences, then ask one relevant follow-up question. Do not give a lecture or list corrections during the roleplay.",
      "If the learner makes mistakes, understand their meaning and keep the conversation flowing. Be supportive and realistic.",
      "This is a spoken conversation, so avoid markdown, long lists, and stage directions.",
      firstTurn ? `Start the scenario now. Opening guidance: ${scenario.opening}` : "",
    ].filter(Boolean).join("\n");
    const payload: PracticeMessage[] = [{ role: "user", content: systemContext }, ...nextMessages];
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "tutor", difficulty, sessionGoal: "Speak more confidently", feedbackStyle: "balanced", messages: payload }),
    });
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || "The roleplay tutor is unavailable. Please try again.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let reply = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      reply += decoder.decode(value, { stream: true });
    }
    reply += decoder.decode();
    if (!reply.trim()) throw new Error("The tutor returned an empty reply. Please try again.");
    return reply.trim();
  }

  async function startRoleplay() {
    setBusy(true);
    setError("");
    setFeedback("");
    setMessages([]);
    setElapsed(0);
    const id = crypto.randomUUID();
    setSessionId(id);
    startedAtRef.current = new Date().toISOString();
    try {
      const reply = await askTutor([], true);
      const initial: PracticeMessage[] = [{ role: "assistant", content: reply }];
      setMessages(initial);
      saveCurrentSession(initial, id);
      setActive(true);
    } catch (cause) {
      setSessionId("");
      setError(cause instanceof Error ? cause.message : "Could not start the roleplay.");
    } finally {
      setBusy(false);
    }
  }

  async function sendAnswer(value = draft) {
    const answer = value.trim();
    if (!answer || busy || !active) return;
    setBusy(true);
    setError("");
    setDraft("");
    const next: PracticeMessage[] = [...messagesRef.current, { role: "user", content: answer }];
    setMessages(next);
    try {
      const reply = await askTutor(next);
      const complete = [...next, { role: "assistant" as const, content: reply }];
      setMessages(complete);
      saveCurrentSession(complete, sessionId);
    } catch (cause) {
      setMessages(next);
      setDraft(answer);
      setError(cause instanceof Error ? cause.message : "Could not send your answer.");
      saveCurrentSession(next, sessionId);
    } finally {
      setBusy(false);
    }
  }

  function startRecording() {
    const Constructor = getRecognitionConstructor();
    if (!Constructor) {
      setError("Speech recognition is not available in this browser. You can still type your answers.");
      return;
    }
    setError("");
    try {
      const recognition = new Constructor();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        let transcript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
        setDraft(transcript.trim());
      };
      recognition.onerror = (event) => {
        setListening(false);
        if (event.error !== "aborted" && event.error !== "no-speech") setError("Microphone capture stopped. You can type your answer instead.");
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      setError("Could not start microphone capture. Check browser microphone permission or type your answer.");
    }
  }

  async function finishRoleplay() {
    setActive(false);
    recognitionRef.current?.stop();
    setBusy(true);
    setError("");
    try {
      const transcript = messagesRef.current.map((item) => `${item.role === "user" ? "Learner" : "Partner"}: ${item.content}`).join("\n");
      const prompt = [
        "Review this English speaking roleplay transcript and give a practical, supportive debrief.",
        "Use only the transcript. Do not invent pronunciation observations because this is text transcription.",
        "Format plain text with these headings: Overall impression, What went well, Improve next, Try saying this, Practice goal.",
        "Give 1-3 specific corrections with brief reasons, preserve the learner's intended meaning, and finish with one small goal.",
        `Scenario: ${scenario.title}; level: ${difficulty}; elapsed time: ${elapsedLabel(elapsed)}.`,
        transcript || "The learner did not provide a spoken or typed answer.",
      ].join("\n\n");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "tutor", difficulty, sessionGoal: "Improve fluency", feedbackStyle: "balanced", messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Could not create your debrief.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
        setFeedback(result);
      }
      result += decoder.decode();
      if (!result.trim()) throw new Error("The tutor returned an empty debrief.");
      setFeedback(result.trim());
      saveCurrentSession(messagesRef.current, sessionId, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create your debrief.");
      saveCurrentSession(messagesRef.current, sessionId, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>SPEAK · RESPOND · GROW</span><h2>Practise the moment before it happens.</h2><p>Take a realistic speaking scenario, respond in your own words, and get a focused debrief when you finish. Use your microphone where supported or type naturally.</p></div>
        <div className={styles.heroBadge} aria-hidden="true"><span>LIVE</span><strong>↗</strong><small>ROLEPLAY</small></div>
      </section>

      {!active && messages.length === 0 && !feedback && <section className={styles.setup}>
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>CHOOSE YOUR SCENARIO</span><h3>Where do you want to practise?</h3></div><span className={styles.step}>01 / 03</span></div>
        <div className={styles.scenarios}>{SCENARIOS.map((item) => <button type="button" key={item.id} className={`${styles.scenario} ${scenarioId === item.id ? styles.selected : ""}`} onClick={() => setScenarioId(item.id)} aria-pressed={scenarioId === item.id}><span className={styles.scenarioIcon}>{item.icon}</span><strong>{item.title}</strong><small>{item.description}</small><span className={styles.role}>Partner: {item.role}</span></button>)}</div>
        <div className={styles.settings}>
          <label>Speaking level<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
          <label>Round length<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={2}>2 minutes</option><option value={5}>5 minutes</option><option value={10}>10 minutes</option></select></label>
        </div>
        <button type="button" className={styles.primary} onClick={startRoleplay} disabled={!persistenceReady || busy}>{busy ? "Preparing your roleplay…" : "Start speaking roleplay"} <span aria-hidden="true">→</span></button>
      </section>}

      {(active || messages.length > 0) && <section className={styles.session}>
        <div className={styles.sessionTop}><div><span className={styles.eyebrow}>YOUR LIVE SESSION</span><h3>{scenario.title}</h3><p>{difficulty} · {duration}-minute round</p></div><div className={styles.timer} aria-live="off"><span className={active ? styles.liveDot : styles.stoppedDot} />{elapsedLabel(elapsed)}</div></div>
        <div className={styles.transcript} aria-label="Roleplay conversation">
          {messages.map((item, index) => <article className={item.role === "user" ? styles.learnerBubble : styles.partnerBubble} key={`${index}-${item.role}`}><span>{item.role === "user" ? "YOU" : "YOUR PARTNER"}</span><p>{item.content}</p>{item.role === "assistant" && <ListenButton text={item.content} label="Listen to partner" className={styles.listen} />}</article>)}
          {busy && !feedback && <div className={styles.thinking} aria-live="polite"><span /> Partner is thinking…</div>}
        </div>
        {active && <form className={styles.replyForm} onSubmit={(event) => { event.preventDefault(); void sendAnswer(); }}>
          <label htmlFor="roleplay-answer">Your answer</label><textarea id="roleplay-answer" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type your answer or use the microphone…" disabled={busy} />
          <div className={styles.replyActions}><button type="button" className={styles.secondary} onClick={() => listening ? recognitionRef.current?.stop() : startRecording()} disabled={busy} aria-pressed={listening}>{listening ? "■ Stop recording" : "🎙 Use microphone"}</button><button type="submit" className={styles.primary} disabled={busy || !draft.trim()}>Send answer <span aria-hidden="true">→</span></button></div>
          <p className={styles.hint}>Tip: answer in 1–3 sentences. You can pause and think before replying.</p>
        </form>}
        {!active && !feedback && <div className={styles.finishedNotice}><p>Round finished. Generate your debrief to review your communication.</p><button className={styles.primary} type="button" onClick={() => void finishRoleplay()} disabled={busy || messages.length === 0}>{busy ? "Preparing debrief…" : "Review my performance"} <span aria-hidden="true">→</span></button></div>}
        {active && <div className={styles.sessionFooter}><span>Keep it natural. Mistakes are part of practice.</span><button type="button" className={styles.finish} onClick={() => { setActive(false); recognitionRef.current?.stop(); }}>End round early</button></div>}
      </section>}

      {error && <p className={styles.error} role="alert">{error}</p>}
      {feedback && <section className={styles.feedback} aria-live="polite"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>AFTER-ACTION REVIEW</span><h3>Your speaking debrief</h3></div><span className={styles.step}>03 / 03</span></div><div className={styles.feedbackText}>{feedback}</div><div className={styles.feedbackActions}><button type="button" className={styles.secondary} onClick={() => { setMessages([]); setFeedback(""); setElapsed(0); setSessionId(""); setError(""); }}>Choose another scenario</button><button type="button" className={styles.primary} onClick={startRoleplay} disabled={busy}>Practise again <span aria-hidden="true">↻</span></button></div></section>}

      <div className={styles.footerNote}><span aria-hidden="true">✦</span><p>Debriefs assess language and communication based on your transcript. They cannot reliably judge pronunciation or tone from text alone.</p></div>
    </div>
  );
}
