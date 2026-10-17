"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListenButton } from "@/components/listen-button";
import { stopSpeaking } from "@/lib/speech-playback";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import { getLearningPreferences, saveLearningPreferences, type SpeechRate, type SpeechVoiceGender } from "@/lib/learning-preferences";

type Correction = { original: string; improved: string; reason: string };
type Turn = { id: string; role: "user" | "assistant"; content: string; createdAt: string; corrections: Correction[] };
type Session = { id: string; title: string; scenario: string; difficulty: string; status: string; startedAt: string; updatedAt: string; durationSeconds: number; turnCount?: number; correctionCount?: number; summary?: Record<string, unknown>; turns?: Turn[] };
type RecognitionResult = { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }>; resultIndex: number };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void };
type RecognitionWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

const SCENARIOS = [
  { name: "Everyday life", description: "Routines, hobbies, and daily plans", icon: "☕" },
  { name: "At work", description: "Meetings, updates, and teamwork", icon: "💼" },
  { name: "Daily stand-up", description: "Yesterday, today, and blockers", icon: "↗" },
  { name: "Job interview", description: "Practice confident interview answers", icon: "✦" },
  { name: "Restaurant conversation", description: "Order food and ask questions", icon: "♨" },
  { name: "Travel and directions", description: "Ask for help while travelling", icon: "🌍" },
  { name: "Phone call", description: "Professional and everyday calls", icon: "☎" },
  { name: "Free conversation", description: "Talk about anything you choose", icon: "◎" },
];
const EMPTY_FEEDBACK: Correction[] = [];
function newTurn(role: Turn["role"], content: string, corrections: Correction[] = []): Turn {
  return { id: crypto.randomUUID(), role, content, corrections, createdAt: new Date().toISOString() };
}
function formatDuration(seconds: number) { const m = Math.floor(seconds / 60); const s = seconds % 60; return m ? `${m}m ${s}s` : `${s}s`; }

export function ConversationCoach() {
  const [tab, setTab] = useState<"practice" | "history" | "progress">("practice");
  const [scenario, setScenario] = useState("Everyday life");
  const [difficulty, setDifficulty] = useState("Intermediate");
  const [voiceGender, setVoiceGender] = useState<SpeechVoiceGender>("automatic");
  const [voiceURI, setVoiceURI] = useState("");
  const [speed, setSpeed] = useState<SpeechRate>(1);
  const [speechPreferencesReady, setSpeechPreferencesReady] = useState(false);
  const [correctionMode, setCorrectionMode] = useState<"balanced" | "detailed">("balanced");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const recognitionRef = useRef<Recognition | null>(null);
  const startListeningRef = useRef<((preserveError?: boolean) => void) | null>(null);
  const sessionIdRef = useRef("");
  const recognizedSpeechRef = useRef("");
  const turnsRef = useRef<Turn[]>([]);
  const startedAtRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (!active) return;
      const preferences = getLearningPreferences();
      setVoiceGender(preferences.speechVoiceGender);
      setVoiceURI(preferences.speechVoiceURI);
      setSpeed(preferences.speechRate);
      setCorrectionMode(preferences.feedbackStyle === "detailed" ? "detailed" : "balanced");
    }).catch(() => {
      if (active) setError("Could not load saved speech preferences from the database.");
    }).finally(() => {
      if (active) setSpeechPreferencesReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith("en")));
    load(); window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);
  useEffect(() => {
    if (!sessionId || !startedAtRef.current) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sessionId]);
  useEffect(() => () => { recognitionRef.current?.abort(); stopSpeaking(); }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/conversation-coach/sessions", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load history.");
      setSessions(data.sessions || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load history."); }
  }, []);
  useEffect(() => { void Promise.resolve().then(() => refreshHistory()); }, [refreshHistory]);

  const availableVoice = useMemo(() => {
    const preferred = voiceGender === "female"
      ? voices.filter(v => /samantha|victoria|karen|zira|jenny|aria|ava|susan|hazel|moira|tessa|fiona|allison|female/i.test(v.name))
      : voiceGender === "male"
        ? voices.filter(v => /alex|daniel|david|mark|guy|james|fred|tom|oliver|george|thomas|aaron|male/i.test(v.name))
        : [];
    return voices.find(v => v.voiceURI === voiceURI) || preferred[0] || voices.find(v => v.lang.toLowerCase() === "en-us") || voices[0];
  }, [voices, voiceGender, voiceURI]);

  const play = useCallback((text: string, resumeListening = false) => {
    const resumeMicrophone = () => {
      if (!resumeListening || !sessionIdRef.current) return;
      window.setTimeout(() => {
        if (sessionIdRef.current) startListeningRef.current?.(true);
      }, 300);
    };
    if (!("speechSynthesis" in window)) {
      setSpeaking(false);
      setError("Speech playback is not supported in this browser. You can still answer using the microphone or text.");
      resumeMicrophone();
      return;
    }
    try {
      stopSpeaking();
      const utterance = new SpeechSynthesisUtterance(text);
      if (availableVoice) { utterance.voice = availableVoice; utterance.lang = availableVoice.lang; }
      else utterance.lang = "en-US";
      utterance.rate = speed;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        setSpeaking(false);
        // Resume the microphone after the tutor finishes so the learner can answer hands-free.
        resumeMicrophone();
      };
      utterance.onerror = () => {
        setSpeaking(false);
        if (resumeListening) setError("Tutor audio could not play. You can continue the conversation by speaking or typing.");
        resumeMicrophone();
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
      setError("Tutor audio could not play. You can continue the conversation by speaking or typing.");
      resumeMicrophone();
    }
  }, [availableVoice, speed]);

  const persistSession = useCallback(async (status: "active" | "completed" = "active", allTurns = turnsRef.current, targetId = sessionId) => {
    if (!targetId) return;
    const response = await fetch("/api/conversation-coach/sessions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: targetId, status, durationSeconds: elapsed, turns: allTurns }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save conversation.");
    if (data.session) setActiveSession(data.session);
    await refreshHistory();
  }, [sessionId, elapsed, refreshHistory]);

  const startSession = useCallback(async () => {
    setError(""); setSummary(null); setTurns([]); turnsRef.current = [];
    const response = await fetch("/api/conversation-coach/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario, difficulty, title: scenario, turns: [] }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not start a session."); return; }
    sessionIdRef.current = data.session.id;
    setSessionId(data.session.id); setActiveSession(data.session); setTab("practice");
    startedAtRef.current = Date.now(); setElapsed(0);
    const greeting = newTurn("assistant", `Hi! I'm your English conversation coach. Let's practise ${scenario.toLowerCase()}. How are you today?`);
    setTurns([greeting]); turnsRef.current = [greeting];
    try {
      const saved = await fetch("/api/conversation-coach/sessions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.session.id, status: "active", durationSeconds: 0, turns: [greeting] }) });
      if (!saved.ok) throw new Error("The session started, but the greeting could not be saved.");
      await refreshHistory();
      play(greeting.content, true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the greeting."); }
  }, [scenario, difficulty, play, refreshHistory]);

  const send = useCallback(async (raw = input) => {
    const content = raw.trim();
    if (!content || busy || !sessionId) return;
    setBusy(true); setError(""); setInput("");
    const userTurn = newTurn("user", content);
    const next = [...turnsRef.current, userTurn];
    setTurns(next); turnsRef.current = next;
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-40).map(({ role, content: text }) => ({ role, content: text })), scenario, difficulty, feedbackStyle: correctionMode }),
      });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "The tutor could not reply."); }
      if (!response.body) throw new Error("Streaming responses are not supported by this browser.");
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let reply = "";
      const assistantId = crypto.randomUUID();
      const placeholder: Turn = { id: assistantId, role: "assistant", content: "", corrections: EMPTY_FEEDBACK, createdAt: new Date().toISOString() };
      setTurns([...next, placeholder]); turnsRef.current = [...next, placeholder];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const partial = [...next, { ...placeholder, content: reply }];
        setTurns(partial); turnsRef.current = partial;
      }
      reply += decoder.decode();
      if (!reply.trim()) throw new Error("The tutor returned an empty response.");
      const assistant = { ...placeholder, content: reply.trim() };
      const finalTurns = [...next, assistant];
      setTurns(finalTurns); turnsRef.current = finalTurns;
      await persistSession("active", finalTurns);
      play(assistant.content, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      try { await persistSession("active", turnsRef.current); } catch { /* Keep the original request error visible. */ }
    } finally { setBusy(false); }
  }, [input, busy, sessionId, scenario, difficulty, correctionMode, persistSession, play]);

  const startListening = (preserveError = false) => {
    if (!preserveError) setError("");
    const ctor = (window as RecognitionWindow).SpeechRecognition || (window as RecognitionWindow).webkitSpeechRecognition;
    if (!ctor) { setError("Speech recognition is not available in this browser. You can type your answer instead."); return; }
    try {
      recognizedSpeechRef.current = "";
      const recognition = new ctor(); recognition.lang = "en-US"; recognition.continuous = false; recognition.interimResults = true;
      recognition.onresult = event => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) transcript += `${event.results[i][0].transcript} `;
        transcript = transcript.trim();
        if (transcript) {
          recognizedSpeechRef.current = transcript;
          setInput(transcript);
        }
      };
      recognition.onerror = event => {
        recognizedSpeechRef.current = "";
        setListening(false);
        setError(event.error === "not-allowed" ? "Please allow microphone access to speak." : `Speech recognition error: ${event.error}. You can type instead.`);
      };
      recognition.onend = () => {
        setListening(false);
        const transcript = recognizedSpeechRef.current.trim();
        recognizedSpeechRef.current = "";
        // Voice-first mode submits the captured answer automatically, then the tutor speaks
        // and the microphone is reactivated for the next turn.
        if (transcript && sessionIdRef.current) window.setTimeout(() => { void send(transcript); }, 0);
      };
      recognitionRef.current = recognition; recognition.start(); setListening(true);
    } catch {
      recognizedSpeechRef.current = "";
      setListening(false);
      setError("Could not start the microphone. Please type your answer instead.");
    }
  };
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);
  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); };
  const endSession = async () => {
    stopListening(); stopSpeaking();
    try {
      await persistSession("completed");
      sessionIdRef.current = "";
      setSessionId(""); setActiveSession(null); startedAtRef.current = 0; setTab("history"); await refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish the session. Your session remains active; please try again.");
    }
  };
  const openHistory = useCallback(async (id: string) => {
    setError("");
    try {
      const response = await fetch(`/api/conversation-coach/sessions?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not open session.");
      setActiveSession(data.session); setTurns(data.session.turns || []); turnsRef.current = data.session.turns || [];
      setSummary(data.session.summary || null); setScenario(data.session.scenario); setDifficulty(data.session.difficulty);
      sessionIdRef.current = data.session.status === "active" ? data.session.id : "";
      setSessionId(sessionIdRef.current);
      const savedDuration = Math.max(0, data.session.durationSeconds || 0);
      // Resume the saved elapsed time when reopening an active session.
      startedAtRef.current = sessionIdRef.current ? Date.now() - savedDuration * 1000 : 0;
      setElapsed(savedDuration); setTab("history");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open session."); }
  }, []);
  const deleteSession = async (id: string) => {
    if (!window.confirm("Delete this conversation and its transcript? This cannot be undone.")) return;
    const response = await fetch(`/api/conversation-coach/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not delete session."); return; }
    if (activeSession?.id === id) { sessionIdRef.current = ""; setActiveSession(null); setTurns([]); setSessionId(""); }
    await refreshHistory();
  };
  const createSummary = async () => {
    if (!activeSession || turns.length < 2) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/session-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: activeSession.scenario, difficulty: activeSession.difficulty, messages: turns.map(t => ({ role: t.role, content: t.content })).filter(t => t.content.trim()).slice(-40) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not create summary.");
      setSummary(data);
      const save = await fetch("/api/conversation-coach/sessions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeSession.id, summary: data, durationSeconds: elapsed }) });
      if (!save.ok) throw new Error("Summary generated but could not be saved.");
      await refreshHistory();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate a summary."); }
    finally { setBusy(false); }
  };
  const allCorrections = turns.flatMap(t => t.corrections || []);
  const totalTurns = sessions.reduce((sum, s) => sum + (s.turnCount || 0), 0);
  const totalCorrections = sessions.reduce((sum, s) => sum + (s.correctionCount || 0), 0);
  const completed = sessions.filter(s => s.status === "completed").length;

  return <div className="coach-workspace">
    <div className="coach-tabs" role="tablist" aria-label="Conversation coach sections">
      {(["practice", "history", "progress"] as const).map(key => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{key === "practice" ? "🎙 Practice" : key === "history" ? "◷ History" : "↗ Progress"}</button>)}
    </div>
    {error && <div className="coach-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {tab === "practice" && <div className="coach-layout">
      <aside className="coach-settings">
        <p className="eyebrow">YOUR SESSION</p><h2>Make it yours</h2>
        <label>Conversation topic<select value={scenario} onChange={e => setScenario(e.target.value)} disabled={!!sessionId}>{SCENARIOS.map(s => <option key={s.name}>{s.name}</option>)}</select></label>
        <div className="coach-topic-grid">{SCENARIOS.slice(0, 4).map(s => <button key={s.name} className={scenario === s.name ? "selected" : ""} onClick={() => setScenario(s.name)} disabled={!!sessionId}><span>{s.icon}</span><strong>{s.name}</strong><small>{s.description}</small></button>)}</div>
        <label>English level<select value={difficulty} onChange={e => setDifficulty(e.target.value)} disabled={!!sessionId}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
        <label>Tutor voice<select value={voiceGender} disabled={!speechPreferencesReady} onChange={e => { const next = e.target.value as SpeechVoiceGender; setVoiceGender(next); setVoiceURI(""); saveLearningPreferences({ ...getLearningPreferences(), speechVoiceGender: next, speechVoiceURI: "" }); }}><option value="automatic">Automatic</option><option value="female">Female voice</option><option value="male">Male voice</option></select></label>
        <label>Specific voice<select value={voiceURI} disabled={!speechPreferencesReady} onChange={e => { const next = e.target.value; setVoiceURI(next); saveLearningPreferences({ ...getLearningPreferences(), speechVoiceURI: next }); }}><option value="">Automatic best match</option>{voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</select><small>Available voices depend on your device and browser.</small></label>
        <label>Speaking speed <span className="coach-speed-value">{speed.toFixed(1)}×</span><input type="range" min="0.8" max="1.2" step="0.2" value={speed} disabled={!speechPreferencesReady} onChange={e => { const next = Number(e.target.value) as SpeechRate; setSpeed(next); saveLearningPreferences({ ...getLearningPreferences(), speechRate: next }); }}/></label>
        <label>Feedback style<select value={correctionMode} onChange={e => { const next = e.target.value as "balanced" | "detailed"; setCorrectionMode(next); saveLearningPreferences({ ...getLearningPreferences(), feedbackStyle: next }); }}><option value="balanced">Balanced and encouraging</option><option value="detailed">More detailed explanations</option></select></label>
        {!sessionId ? <button className="button button-primary coach-start" onClick={() => void startSession()}>Start conversation <span>↗</span></button> : <button className="button button-light coach-start" onClick={() => void endSession()}>Finish & save session</button>}
        <p className="coach-privacy">Your transcripts and feedback are saved in your local SQLite database.</p>
      </aside>
      <section className="coach-chat" aria-label="AI conversation">
        <header className="coach-chat-head"><div className="coach-avatar">✦</div><div><strong>SpeakUp conversation coach</strong><p><span className="status-dot"/> {sessionId ? "Session in progress" : "Ready when you are"}</p></div><span className="coach-duration">◷ {formatDuration(elapsed)}</span></header>
        {!sessionId && turns.length === 0 ? <div className="coach-empty"><div className="coach-orb">✦</div><h2>Your English, your moment.</h2><p>Choose a topic and start speaking. I&apos;ll listen, respond naturally, and help you improve without interrupting every sentence.</p><button className="button button-primary" onClick={() => void startSession()}>Let&apos;s talk <span>→</span></button><div className="coach-prompt-chips"><span>Daily conversation</span><span>Work English</span><span>Build confidence</span></div></div> :
          <div className="coach-messages">{turns.map(turn => <article key={turn.id} className={`coach-message ${turn.role}`}><div className="coach-message-label">{turn.role === "assistant" ? "✦ Your tutor" : "You"}</div><p>{turn.content || (busy ? "Thinking…" : "")}</p>{turn.content && <div className="coach-message-actions"><ListenButton text={turn.content} label="Play sentence" className="coach-mini-button"/>{turn.role === "user" && <button className="coach-mini-button" onClick={() => play(turn.content)}>Repeat your answer</button>}</div>}{turn.corrections?.map((c, i) => <div key={i} className="coach-correction"><span>Try this instead</span><del>{c.original}</del><strong>{c.improved}</strong><small>{c.reason}</small></div>)}</article>)}<div ref={bottomRef}/></div>}
        {sessionId && <div className="coach-composer"><textarea aria-label="Your answer" placeholder={listening ? "Listening… speak naturally" : "Type your answer or use the microphone…"} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={2} disabled={busy}/><div className="coach-composer-actions"><span>Enter to send · Shift + Enter for a new line</span><div><button className={listening ? "coach-mic-button listening" : "coach-mic-button"} onClick={() => listening ? stopListening() : startListening()} disabled={busy} aria-label={listening ? "Stop recording" : "Start voice input"}>{listening ? "■ Stop" : "🎙 Speak"}</button><button className="button button-primary" onClick={() => void send()} disabled={busy || !input.trim()}>{busy ? "Thinking…" : "Send ↑"}</button></div></div></div>}
        {sessionId && <p className="coach-disclaimer">Speech recognition and voice playback depend on your browser and device. You can always type instead.</p>}
      </section>
    </div>}
    {tab === "history" && <section className="coach-history"><div className="coach-section-heading"><div><p className="eyebrow">YOUR CONVERSATIONS</p><h2>Every practice counts.</h2><p>Open any session to review the transcript, replay sentences, or create a learning summary.</p></div><button className="button button-primary" onClick={() => { setActiveSession(null); setTurns([]); turnsRef.current = []; setSessionId(""); setTab("practice"); }}>+ New session</button></div>
      {sessions.length === 0 ? <div className="coach-empty-history"><span>◷</span><h3>Your story starts here</h3><p>Complete your first conversation and it will appear here, saved in SQLite.</p><button className="button button-primary" onClick={() => { setTab("practice"); void startSession(); }}>Start your first session</button></div> :
        <div className="coach-history-grid">{sessions.map(s => <article key={s.id} className={`coach-history-card ${activeSession?.id === s.id ? "selected" : ""}`}><button className="coach-history-open" onClick={() => void openHistory(s.id)}><span className="coach-history-icon">✦</span><span className="coach-history-status">{s.status === "completed" ? "Completed" : "In progress"}</span><h3>{s.title}</h3><p>{s.scenario} · {s.difficulty}</p><small>{new Date(s.updatedAt).toLocaleString()} · {s.turnCount || 0} turns · {formatDuration(s.durationSeconds || 0)}</small></button><button className="coach-delete" aria-label={`Delete ${s.title}`} onClick={() => void deleteSession(s.id)}>Delete</button></article>)}</div>}
      {activeSession && <article className="coach-review"><div className="coach-section-heading"><div><p className="eyebrow">SESSION REVIEW</p><h2>{activeSession.title}</h2><p>{activeSession.scenario} · {new Date(activeSession.startedAt).toLocaleString()}</p></div><button className="button button-light" onClick={() => void createSummary()} disabled={busy || turns.filter(t => t.content.trim()).length < 2}>{busy ? "Preparing…" : "✨ Generate AI review"}</button></div><div className="coach-review-turns">{turns.map(t => <article key={t.id} className={`coach-message ${t.role}`}><div className="coach-message-label">{t.role === "assistant" ? "Tutor" : "You"}</div><p>{t.content}</p><ListenButton text={t.content} label="Replay" className="coach-mini-button"/>{t.corrections?.map((c, i) => <div key={i} className="coach-correction"><del>{c.original}</del><strong>{c.improved}</strong><small>{c.reason}</small></div>)}</article>)}</div>{summary && <div className="coach-summary"><p className="eyebrow">AI LEARNING REVIEW</p><h3>{String(summary.topicSummary || "Session summary")}</h3>{Array.isArray(summary.strengths) && <><strong>What went well</strong><ul>{(summary.strengths as string[]).map((x,i)=><li key={i}>{x}</li>)}</ul></>}{Array.isArray(summary.corrections) && <><strong>Useful corrections</strong>{(summary.corrections as Correction[]).map((x,i)=><p key={i}><del>{x.original}</del> → <b>{x.improved}</b><small>{x.reason}</small></p>)}</>}{typeof summary.followUpExercise === "string" && <p><strong>Next exercise:</strong> {summary.followUpExercise}</p>}</div>}</article>}
    </section>}
    {tab === "progress" && <section className="coach-history"><p className="eyebrow">YOUR SPEAKING JOURNEY</p><h2>Progress, not perfection.</h2><p className="coach-progress-intro">A transparent view of your saved practice activity. These are activity counts, not an automated proficiency score.</p><div className="coach-progress-stats"><article><span>◷</span><strong>{sessions.length}</strong><p>Sessions saved</p></article><article><span>✓</span><strong>{completed}</strong><p>Sessions completed</p></article><article><span>☷</span><strong>{totalTurns}</strong><p>Conversation turns</p></article><article><span>✦</span><strong>{totalCorrections}</strong><p>Saved corrections</p></article></div><div className="coach-progress-card"><h3>Topics you have practised</h3>{sessions.length ? <div className="coach-topic-chips">{Array.from(new Set(sessions.map(s => s.scenario))).map(topic => <span key={topic}>{topic} · {sessions.filter(s => s.scenario === topic).length}</span>)}</div> : <p>Start a conversation to begin building your practice history.</p>}<button className="button button-primary" onClick={() => setTab("practice")}>Practise again <span>→</span></button></div><p className="coach-progress-note">Pronunciation is not scored by this feature. Browser speech-to-text transcripts can help review wording, but they do not measure phoneme accuracy, intonation, or accent.</p></section>}
    {speaking && <button className="coach-stop-audio" onClick={() => { stopSpeaking(); setSpeaking(false); }}>■ Stop tutor audio</button>}
  </div>;
}
