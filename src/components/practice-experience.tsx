"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSessions, removeSession, saveVocabulary, upsertSession, type PracticeSession, type SessionSummary } from "@/lib/learning-storage";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import { assessTranscript, type TranscriptAssessment } from "@/lib/pronunciation-assessment";
import { applyAccessibilityPreferences, getLearningPreferences, type LearningPreferences } from "@/lib/learning-preferences";
import { getLearningScenarios } from "@/lib/learning-scenarios";
import { speakText } from "@/lib/speech-playback";
import { submitLearningEvidence } from "@/lib/learning-evidence-client";

type Scenario = { number: string; title: string; description: string; icon: string; tone: string };
const SESSION_GOALS = ["Speak more confidently", "Improve grammar", "Expand vocabulary", "Practice workplace English", "Prepare for an interview", "Improve fluency"] as const;
type SessionGoal = typeof SESSION_GOALS[number];
type Message = { role: "user" | "assistant"; content: string };
type PhonemeIssue = { word: string; expected: string; actual: string | null; confidence: number; phones: { expected: string; heard: string | null; confidence: number }[] };
type PhonemeAssessment = { score: number; transcript: string; phonemeErrorRate: number | null; wordErrorRate: number | null; errors: PhonemeIssue[] };

type Feedback = {
  originalSentence: string;
  correctedSentence: string;
  explanation: string;
  issues: { original: string; corrected: string; category: "grammar" | "naturalness"; importance: "important" | "optional"; explanation: string }[];
  practicePrompt: string;
  tips: string[];
  pronunciationTip: string;
  vocabulary: { phrase: string; meaning: string; example: string }[];
};
type SpeechAlternative = { transcript: string };
type SpeechResult = ArrayLike<SpeechAlternative>;
type SpeechRecognitionResultEvent = { results: ArrayLike<SpeechResult> };
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function getCurrentTimestamp() { return Date.now(); }

function createId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${getCurrentTimestamp()}-${Math.random().toString(36).slice(2)}`;
}

export function PracticeExperience({ prompts }: { prompts: Scenario[] }) {
  const [availablePrompts, setAvailablePrompts] = useState<Scenario[]>(prompts);
  const [scenario, setScenario] = useState(prompts[0]?.title ?? "Free conversation");
  const [difficulty, setDifficulty] = useState<"Beginner" | "Intermediate" | "Advanced">("Beginner");
  const [sessionGoal, setSessionGoal] = useState<SessionGoal>("Speak more confidently");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number | null>(null);
  const [sessionDeadline, setSessionDeadline] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [learningPreferences, setLearningPreferences] = useState<LearningPreferences | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceSessionState, setVoiceSessionState] = useState<"idle" | "active" | "paused">("idle");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [pronunciationAssessment, setPronunciationAssessment] = useState<TranscriptAssessment | null>(null);
  const [pronunciationMode, setPronunciationMode] = useState(false);
  const [phonemeRecording, setPhonemeRecording] = useState(false);
  const [phonemeAssessmentLoading, setPhonemeAssessmentLoading] = useState(false);
  const [phonemeAssessment, setPhonemeAssessment] = useState<PhonemeAssessment | null>(null);
  const [phonemeAssessmentError, setPhonemeAssessmentError] = useState("");
  const [savedPhrases, setSavedPhrases] = useState<string[]>([]);
  const [savedSessions, setSavedSessions] = useState<PracticeSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const conversationEnd = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceSessionStateRef = useRef<"idle" | "active" | "paused">("idle");
  const voiceTurnPendingRef = useRef(false);
  const voiceSpeakingRef = useRef(false);
  const voiceRestartTimerRef = useRef<number | null>(null);
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<string | null>(null);

  useEffect(() => {
    conversationEnd.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (!active) return;
      const speech = window as SpeechWindow;
      setSpeechSupported(Boolean(speech.SpeechRecognition || speech.webkitSpeechRecognition));
      const customPrompts = getLearningScenarios().filter((item) => item.custom).map((item, index) => ({ number: String(prompts.length + index + 1).padStart(2, "0"), title: item.title, description: item.description, icon: item.icon, tone: item.tone }));
      setAvailablePrompts([...prompts, ...customPrompts]);
      setSavedSessions(getSessions());
      const preferences = getLearningPreferences();
      setLearningPreferences(preferences);
      setDifficulty(preferences.englishLevel);
      applyAccessibilityPreferences(preferences);
    }).catch(() => { if (active) setError("Could not load saved learning data from the database. Refresh to retry."); });
    return () => {
      active = false;
      recognitionRef.current?.stop();
      if (voiceRestartTimerRef.current !== null) window.clearTimeout(voiceRestartTimerRef.current);
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.ondataavailable = null;
        if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  function deleteSelectedSession() {
    const selected = savedSessions.find((session) => session.id === selectedSessionId);
    if (!selected || isStreaming || listening) return;
    const confirmed = window.confirm("Delete this saved conversation, transcript, and summary? This cannot be undone.");
    if (!confirmed) return;
    removeSession(selected.id);
    setSavedSessions(getSessions());
    setSelectedSessionId("");
  }

  useEffect(() => {
    if (sessionDeadline === null) return;
    let finished = false;
    const tick = () => {
      if (finished) return;
      const remaining = Math.max(0, Math.ceil((sessionDeadline - getCurrentTimestamp()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        finished = true;
        setSessionExpired(true);
        recognitionRef.current?.stop();
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        window.clearInterval(timer);
      }
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sessionDeadline]);

  function chooseScenario(title: string) {
    if (isStreaming || listening) return;
    setScenario(title);
    resetConversation();
  }

  function speak(text: string, onEnd?: () => void) {
    const started = speakText(text, onEnd);
    if (!started) {
      setVoiceError("Text-to-speech is not supported in this browser.");
      onEnd?.();
      return;
    }
    setVoiceError("");
  }

  async function submitPhonemeAssessment(audio: Blob) {
    if (!feedback?.correctedSentence) return;
    setPhonemeAssessmentLoading(true);
    setPhonemeAssessmentError("");
    setPhonemeAssessment(null);
    const form = new FormData();
    const extension = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", audio, "pronunciation." + extension);
    form.append("expectedText", feedback.correctedSentence);
    try {
      const response = await fetch("/api/pronunciation", { method: "POST", body: form });
      const payload = await response.json() as PhonemeAssessment & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Phoneme-level assessment failed. Please try again.");
      setPhonemeAssessment(payload);
    } catch (caught) {
      setPhonemeAssessmentError(caught instanceof Error ? caught.message : "Phoneme-level assessment failed. Please try again.");
    } finally {
      setPhonemeAssessmentLoading(false);
    }
  }

  async function startPhonemeRecording() {
    if (phonemeRecording || phonemeAssessmentLoading) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setPhonemeAssessmentError("Audio recording is not supported in this browser. Use a recent browser on HTTPS or localhost, or continue with transcript-based practice.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      recorder.onerror = () => {
        setPhonemeAssessmentError("The audio recording failed. Check your microphone and try again.");
        setPhonemeRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        setPhonemeRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        const audio = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (audio.size === 0) { setPhonemeAssessmentError("No audio was captured. Please record your sentence again."); return; }
        void submitPhonemeAssessment(audio);
      };
      recorder.start();
      setPhonemeAssessment(null);
      setPhonemeAssessmentError("");
      setPhonemeRecording(true);
    } catch (caught) {
      const name = caught instanceof Error ? caught.name : "";
      setPhonemeAssessmentError(name === "NotAllowedError" || name === "PermissionDeniedError"
        ? "Microphone access was denied. Allow microphone access in your browser settings to assess individual sounds."
        : "Could not access the microphone. Check browser permissions and try again, or use transcript-based practice.");
    }
  }

  function stopPhonemeRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }
  function startListening(mode: "compose" | "pronunciation" = "compose") {
    const speech = window as SpeechWindow;
    const Recognition = speech.SpeechRecognition || speech.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("Voice input is not supported here. Try the latest Chrome or Edge, or type your message.");
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (!transcript) return;
      if (mode === "compose" && voiceSessionStateRef.current === "active") {
        voiceTurnPendingRef.current = true;
        setDraft(transcript);
        setVoiceError("");
        void sendMessage(undefined, transcript);
      } else if (mode === "compose") {
        setDraft((current) => current.trim() ? current.trim() + " " + transcript : transcript);
      } else if (feedback) {
        setPronunciationAssessment(assessTranscript(feedback.correctedSentence, transcript));
      }
      setVoiceError("");
    };
    recognition.onerror = (event) => {
      setVoiceError(event.error === "not-allowed"
        ? "Microphone access was denied. Allow microphone access in your browser settings."
        : event.error === "no-speech"
          ? ""
          : `Voice input failed (${event.error}). You can still type your message.`);
      if (event.error === "not-allowed" && voiceSessionStateRef.current === "active") {
        voiceTurnPendingRef.current = false;
        voiceSpeakingRef.current = false;
        updateVoiceSessionState("idle");
      }
    };
    recognition.onend = () => {
      setListening(false);
      setPronunciationMode(false);
      recognitionRef.current = null;
      if (mode === "compose" && voiceSessionStateRef.current === "active" && !voiceTurnPendingRef.current && !voiceSpeakingRef.current) {
        scheduleVoiceListening();
      }
    };
    recognitionRef.current = recognition;
    setPronunciationMode(mode === "pronunciation");
    setListening(true);
    setVoiceError("");
    try { recognition.start(); }
    catch {
      setListening(false);
      setPronunciationMode(false);
      setVoiceError("Could not start the microphone. Please try again.");
    }
  }

  function scheduleVoiceListening() {
    if (voiceRestartTimerRef.current !== null) window.clearTimeout(voiceRestartTimerRef.current);
    voiceRestartTimerRef.current = window.setTimeout(() => {
      voiceRestartTimerRef.current = null;
      if (voiceSessionStateRef.current === "active" && !voiceTurnPendingRef.current && !voiceSpeakingRef.current && !recognitionRef.current) {
        startListening("compose");
      }
    }, 350);
  }

  function stopListening() {
    if (voiceRestartTimerRef.current !== null) {
      window.clearTimeout(voiceRestartTimerRef.current);
      voiceRestartTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    setListening(false);
    setPronunciationMode(false);
  }

  function updateVoiceSessionState(state: "idle" | "active" | "paused") {
    voiceSessionStateRef.current = state;
    setVoiceSessionState(state);
  }

  function startVoiceSession() {
    if (!speechSupported) {
      setVoiceError("Voice input is not supported in this browser. Try the latest Chrome or Edge, or type your message.");
      return;
    }
    if (voiceRestartTimerRef.current !== null) window.clearTimeout(voiceRestartTimerRef.current);
    voiceTurnPendingRef.current = false;
    voiceSpeakingRef.current = false;
    updateVoiceSessionState("active");
    startListening("compose");
  }

  function endVoiceSession() {
    updateVoiceSessionState("idle");
    voiceTurnPendingRef.current = false;
    voiceSpeakingRef.current = false;
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setVoiceError("");
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>, contentOverride?: string) {
    event?.preventDefault();
    const content = (contentOverride ?? draft).trim();
    if (!content || isStreaming || sessionExpired) return;
    if (voiceSessionStateRef.current === "active") voiceTurnPendingRef.current = true;

    const nextMessages: Message[] = [...messagesRef.current, { role: "user", content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setDraft("");
    setError("");
    setFeedback(null);
    setFeedbackError("");
    setSessionSummary(null);
    setSummaryError("");
    setPronunciationAssessment(null);
    setIsStreaming(true);

    if (!sessionIdRef.current) {
      sessionIdRef.current = createId();
      sessionStartedAtRef.current = new Date().toISOString();
      setSessionExpired(false);
      if (sessionDurationMinutes !== null) {
        const deadline = getCurrentTimestamp() + sessionDurationMinutes * 60 * 1000;
        setSessionDeadline(deadline);
        setRemainingSeconds(sessionDurationMinutes * 60);
      }
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, difficulty, sessionGoal, sessionDurationMinutes, feedbackStyle: learningPreferences?.feedbackStyle ?? "balanced", preferredTopics: learningPreferences?.preferredTopics ?? [], messages: nextMessages }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "Unable to get an AI response.");
      }
      if (!response.body) throw new Error("The server did not return a response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages([...nextMessages, { role: "assistant", content: assistantText }]);
      }
      assistantText += decoder.decode();
      const completeMessages = [...nextMessages, { role: "assistant" as const, content: assistantText }];
      setMessages(completeMessages);
      if (!assistantText.trim()) {
        setError("The AI returned an empty response. Please try again.");
        voiceTurnPendingRef.current = false;
        if (voiceSessionStateRef.current === "active") scheduleVoiceListening();
      } else {
        if (voiceSessionStateRef.current === "active") {
          voiceTurnPendingRef.current = false;
          voiceSpeakingRef.current = true;
          speak(assistantText, () => {
            voiceSpeakingRef.current = false;
            if (voiceSessionStateRef.current === "active") scheduleVoiceListening();
          });
        }
        const startedAt = sessionStartedAtRef.current ?? new Date().toISOString();
        const updatedAt = new Date().toISOString();
        const sessionId = sessionIdRef.current ?? createId();
        sessionIdRef.current = sessionId;
        const learnerMessageCount = completeMessages.filter((message) => message.role === "user").length;
        const durationSeconds = Math.max(1, Math.round((new Date(updatedAt).getTime() - new Date(startedAt).getTime()) / 1000));
        upsertSession({
          id: sessionId,
          scenario,
          goal: sessionGoal,
          durationLimitMinutes: sessionDurationMinutes,
          startedAt,
          updatedAt,
          durationSeconds,
          messageCount: learnerMessageCount,
          learnerMessages: completeMessages.filter((message) => message.role === "user").map((message) => message.content).slice(-40),
          messages: completeMessages.slice(-100),
        });
        const goalText = sessionGoal.toLowerCase();
        const skillKey = goalText.includes("grammar") ? "grammar"
          : goalText.includes("vocabulary") ? "vocabulary"
            : goalText.includes("fluency") ? "fluency" : "speaking";
        void submitLearningEvidence({
          source: "conversation",
          activityType: "conversation",
          activityRef: scenario,
          skillKey,
          responseText: content,
          durationSeconds,
          idempotencyKey: `conversation:${sessionId}:${learnerMessageCount}`,
        }).catch(() => undefined);
        setSavedSessions(getSessions());
        // Read persisted preferences at send time as well as from React state.
        // The learner can send the first message before async initialization finishes.
        const currentPreferences = learningPreferences ?? getLearningPreferences();
        if (currentPreferences.feedbackTiming === "immediate") {
          void requestFeedback(content, assistantText);
        }
      }
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setMessages(nextMessages);
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
      voiceTurnPendingRef.current = false;
      if (voiceSessionStateRef.current === "active") scheduleVoiceListening();
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  async function requestFollowUp() {
    const conversationMessages = messages.filter((message) => message.content.trim()).slice(-40);
    if (
      isStreaming ||
      conversationMessages[conversationMessages.length - 1]?.role !== "assistant" ||
      !conversationMessages.some((message) => message.role === "user")
    ) return;

    setIsStreaming(true);
    setError("");
    setFeedback(null);
    setFeedbackError("");
    setSessionSummary(null);
    setSummaryError("");
    setPronunciationAssessment(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "follow-up",
          scenario,
          difficulty,
          feedbackStyle: learningPreferences?.feedbackStyle ?? "balanced",
          preferredTopics: learningPreferences?.preferredTopics ?? [],
          messages: conversationMessages,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Unable to generate a follow-up question.");
      }
      if (!response.body) throw new Error("The server did not return a response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages([...conversationMessages, { role: "assistant", content: assistantText }]);
      }
      assistantText += decoder.decode();
      if (!assistantText.trim()) throw new Error("The AI returned an empty follow-up. Please try again.");
      const completeMessages = [...conversationMessages, { role: "assistant" as const, content: assistantText }];
      setMessages(completeMessages);
      const startedAt = sessionStartedAtRef.current ?? new Date().toISOString();
      const updatedAt = new Date().toISOString();
      const sessionId = sessionIdRef.current ?? createId();
      sessionIdRef.current = sessionId;
      sessionStartedAtRef.current = startedAt;
      upsertSession({
        id: sessionId,
        scenario,
        goal: sessionGoal,
        durationLimitMinutes: sessionDurationMinutes,
        startedAt,
        updatedAt,
        durationSeconds: Math.max(1, Math.round((new Date(updatedAt).getTime() - new Date(startedAt).getTime()) / 1000)),
        messageCount: completeMessages.filter((message) => message.role === "user").length,
        learnerMessages: completeMessages.filter((message) => message.role === "user").map((message) => message.content).slice(-40),
        messages: completeMessages.slice(-100),
      });
      setSavedSessions(getSessions());
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setMessages(conversationMessages);
      setError(caught instanceof Error ? caught.message : "Could not generate a follow-up question.");
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  async function requestSimplerExplanation() {
    const conversationMessages = messages.filter((message) => message.content.trim()).slice(-40);
    if (
      isStreaming ||
      conversationMessages[conversationMessages.length - 1]?.role !== "assistant" ||
      !conversationMessages.some((message) => message.role === "user")
    ) return;

    setIsStreaming(true);
    setError("");
    setFeedback(null);
    setFeedbackError("");
    setSessionSummary(null);
    setSummaryError("");
    setPronunciationAssessment(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "simplify",
          scenario,
          difficulty,
          feedbackStyle: learningPreferences?.feedbackStyle ?? "balanced",
          preferredTopics: learningPreferences?.preferredTopics ?? [],
          messages: conversationMessages,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Unable to simplify the explanation.");
      }
      if (!response.body) throw new Error("The server did not return a response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages([...conversationMessages, { role: "assistant", content: assistantText }]);
      }
      assistantText += decoder.decode();
      if (!assistantText.trim()) throw new Error("The AI returned an empty explanation. Please try again.");
      const completeMessages = [...conversationMessages, { role: "assistant" as const, content: assistantText }];
      setMessages(completeMessages);
      const startedAt = sessionStartedAtRef.current ?? new Date().toISOString();
      const updatedAt = new Date().toISOString();
      const sessionId = sessionIdRef.current ?? createId();
      sessionIdRef.current = sessionId;
      sessionStartedAtRef.current = startedAt;
      upsertSession({
        id: sessionId,
        scenario,
        goal: sessionGoal,
        durationLimitMinutes: sessionDurationMinutes,
        startedAt,
        updatedAt,
        durationSeconds: Math.max(1, Math.round((new Date(updatedAt).getTime() - new Date(startedAt).getTime()) / 1000)),
        messageCount: completeMessages.filter((message) => message.role === "user").length,
        learnerMessages: completeMessages.filter((message) => message.role === "user").map((message) => message.content).slice(-40),
        messages: completeMessages.slice(-100),
      });
      setSavedSessions(getSessions());
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setMessages(conversationMessages);
      setError(caught instanceof Error ? caught.message : "Could not simplify the explanation.");
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  async function requestFeedback(learnerMessageOverride?: string, assistantMessageOverride?: string) {
    const learnerMessage = learnerMessageOverride ?? [...messages].reverse().find((message) => message.role === "user")?.content;
    const assistantMessage = assistantMessageOverride ?? [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim())?.content;
    if (!learnerMessage || !assistantMessage || feedbackLoading) return;
    setFeedbackLoading(true);
    setFeedbackError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learnerMessage, assistantMessage }),
      });
      const result = await response.json() as Feedback & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not generate English feedback.");
      setFeedback(result);
      setPronunciationAssessment(null);
    } catch (caught) {
      setFeedbackError(caught instanceof Error ? caught.message : "Could not generate English feedback.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function requestSessionSummary() {
    if (messages.length < 2 || !hasReply || summaryLoading || isStreaming) return;
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const response = await fetch("/api/session-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, difficulty, messages: messages.filter((message) => message.content.trim()).slice(-40) }),
      });
      const result = await response.json() as SessionSummary & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not generate the session summary.");
      const completeMessages = messages.filter((message) => message.content.trim()).slice(-100);
      const sessionId = sessionIdRef.current ?? createId();
      sessionIdRef.current = sessionId;
      const startedAt = sessionStartedAtRef.current ?? new Date().toISOString();
      sessionStartedAtRef.current = startedAt;
      const updatedAt = new Date().toISOString();
      upsertSession({
        id: sessionId,
        scenario,
        goal: sessionGoal,
        durationLimitMinutes: sessionDurationMinutes,
        startedAt,
        updatedAt,
        durationSeconds: Math.max(1, Math.round((new Date(updatedAt).getTime() - new Date(startedAt).getTime()) / 1000)),
        messageCount: completeMessages.filter((message) => message.role === "user").length,
        learnerMessages: completeMessages.filter((message) => message.role === "user").map((message) => message.content).slice(-40),
        messages: completeMessages,
        summary: result,
      });
      setSavedSessions(getSessions());
      setSessionSummary(result);
    } catch (caught) {
      setSummaryError(caught instanceof Error ? caught.message : "Could not generate the session summary.");
    } finally {
      setSummaryLoading(false);
    }
  }

  function resetConversation() {
    if (isStreaming) abortRef.current?.abort();
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setMessages([]);
    setDraft("");
    setError("");
    setFeedback(null);
    setFeedbackError("");
    setSessionSummary(null);
    setSummaryError("");
    setPronunciationAssessment(null);
    setSavedPhrases([]);
    setSessionDeadline(null);
    setRemainingSeconds(null);
    setSessionExpired(false);
    sessionIdRef.current = null;
    sessionStartedAtRef.current = null;
    setSelectedSessionId("");
  }

  function restoreSession(session: PracticeSession) {
    if (isStreaming || listening) return;
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const restoredMessages = Array.isArray(session.messages) && session.messages.length
      ? session.messages
      : session.learnerMessages.map((content) => ({ role: "user" as const, content }));
    setScenario(session.scenario);
    setSessionGoal(SESSION_GOALS.includes(session.goal as SessionGoal) ? session.goal as SessionGoal : "Speak more confidently");
    const duration = [5, 10, 15, 20].includes(Number(session.durationLimitMinutes)) ? Number(session.durationLimitMinutes) : null;
    setSessionDurationMinutes(duration);
    const started = Date.parse(session.startedAt);
    const deadline = duration !== null && Number.isFinite(started) ? started + duration * 60 * 1000 : null;
    setSessionDeadline(deadline);
    setSessionExpired(deadline !== null && deadline <= getCurrentTimestamp());
    setRemainingSeconds(deadline === null ? null : Math.max(0, Math.ceil((deadline - getCurrentTimestamp()) / 1000)));
    setMessages(restoredMessages);
    setDraft("");
    setError("");
    setFeedback(null);
    setFeedbackError("");
    setSessionSummary(session.summary ?? null);
    setSummaryError("");
    setPronunciationAssessment(null);
    setSavedPhrases([]);
    sessionIdRef.current = session.id;
    sessionStartedAtRef.current = session.startedAt;
    setSelectedSessionId(session.id);
  }

  function savePhrase(item: Feedback["vocabulary"][number]) {
    saveVocabulary(item);
    setSavedPhrases((current) => current.includes(item.phrase) ? current : [...current, item.phrase]);
  }

  const hasReply = messages.some((message) => message.role === "assistant" && message.content.trim().length > 0);

  return (
    <>
      <section className="section-block" aria-labelledby="scenario-heading">
        <div className="section-heading">
          <div><p className="eyebrow">CHOOSE YOUR SCENARIO</p><h2 id="scenario-heading">What feels right today?</h2></div>
          <span className="section-note">Choose a topic to guide your coach</span>
        </div>
        <div className="scenario-grid">
          {availablePrompts.map((prompt) => (
            <button className={`scenario-card scenario-choice ${scenario === prompt.title ? "selected" : ""}`} type="button" key={prompt.number} onClick={() => chooseScenario(prompt.title)} aria-pressed={scenario === prompt.title} disabled={isStreaming || listening || voiceSessionState !== "idle"}>
              <span className="scenario-top"><span className={`scenario-icon ${prompt.tone}`}>{prompt.icon}</span><span className="scenario-number">{prompt.number}</span></span>
              <span className="scenario-title">{prompt.title}</span><span className="scenario-description">{prompt.description}</span>
              <span className="scenario-bottom"><span>Guided conversation</span><span className="scenario-arrow">{scenario === prompt.title ? "✓" : "↗"}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="roleplay-settings" aria-label="Role-play settings"><div><p className="eyebrow">SET YOUR PACE</p><strong>Choose your English level and session goal</strong><p>The coach adapts its vocabulary and questions to your level and what you want to practise.</p></div><label htmlFor="practice-difficulty">Difficulty<select id="practice-difficulty" value={difficulty} disabled={isStreaming || messages.length > 0 || !learningPreferences} onChange={(event) => { setDifficulty(event.target.value as typeof difficulty); resetConversation(); }}><option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option></select></label><label htmlFor="session-goal">Session goal<select id="session-goal" value={sessionGoal} disabled={isStreaming || messages.length > 0} onChange={(event) => setSessionGoal(event.target.value as SessionGoal)}>{SESSION_GOALS.map((goal) => <option key={goal} value={goal}>{goal}</option>)}</select></label><label htmlFor="session-duration">Session duration<select id="session-duration" value={sessionDurationMinutes === null ? "" : String(sessionDurationMinutes)} disabled={isStreaming || messages.length > 0} onChange={(event) => setSessionDurationMinutes(event.target.value ? Number(event.target.value) : null)}><option value="">No time limit</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option></select></label></section>

      <section className="chat-panel" aria-label="AI English conversation">
        <div className="chat-header">
          <div className="chat-coach-mark">✦</div>
          <div className="chat-header-copy"><strong>Your AI conversation partner</strong><span>Topic: {scenario}</span><span>Goal: {sessionGoal}</span></div>
          <div className="session-time-status" role="timer" aria-label="Practice session countdown">{sessionExpired ? "Session time is up" : remainingSeconds !== null ? "Time left " + Math.floor(remainingSeconds / 60).toString().padStart(2, "0") + ":" + String(remainingSeconds % 60).padStart(2, "0") : sessionDurationMinutes !== null ? sessionDurationMinutes + "-minute session" : "No time limit"}</div>
          <div className="session-history-controls">
            <label className="sr-only" htmlFor="saved-session">Saved conversations</label>
            <select id="saved-session" value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} disabled={isStreaming || listening}>
              <option value="">Recent conversations ({savedSessions.length})</option>
              {savedSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.scenario} · {new Date(session.updatedAt).toLocaleDateString()} · {session.messageCount} messages{session.summary ? " · summary saved" : ""}
                </option>
              ))}
            </select>
            <button className="chat-reset" type="button" onClick={() => {
              const selected = savedSessions.find((session) => session.id === selectedSessionId);
              if (selected) restoreSession(selected);
            }} disabled={!selectedSessionId || isStreaming || listening}>Restore</button>
            <button className="chat-reset" type="button" onClick={deleteSelectedSession} disabled={!selectedSessionId || isStreaming || listening}>Delete selected</button>
            <button className="chat-reset" type="button" onClick={resetConversation} disabled={!messages.length && !error && !feedback}>New conversation</button>
          </div>
        </div>
        <div className="voice-session-controls" aria-label="Voice conversation controls">
          <div className="voice-session-actions">
            {voiceSessionState === "active" ? (
              <button className="button button-voice" type="button" onClick={endVoiceSession}>End voice conversation</button>
            ) : (
              <button className="button button-voice" type="button" onClick={startVoiceSession} disabled={!speechSupported || sessionExpired}>Start voice conversation</button>
            )}
          </div>
          <p className="voice-session-status" role="status">{voiceSessionState === "active" ? listening ? "Listening — speak naturally. Your reply will be sent automatically; the AI will speak back and listen again." : isStreaming ? "Your AI coach is responding. It will listen again after speaking." : "Voice conversation active. Waiting for the next turn…" : speechSupported ? "Start one continuous, hands-free voice conversation. Allow microphone access when prompted." : "Voice input is not supported in this browser. Try the latest Chrome or Edge."}</p>
        </div>
        <div className="chat-transcript" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <span className="chat-welcome-spark">✦</span><h3>Ready when you are.</h3>
              <p>Start a <strong>{scenario.toLowerCase()}</strong> role-play. The coach will stay in character, ask one question at a time, and adapt to your {difficulty.toLowerCase()} level.</p>
              <button type="button" className="suggestion-chip" onClick={() => setDraft(scenario === "Job interview" ? "Hello, thank you for meeting with me. I am ready to introduce myself." : scenario === "Daily stand-up" ? "Yesterday I worked on my task, and today I plan to continue it." : scenario === "Team meeting" ? "I would like to share an idea with the team." : scenario === "Explain a technical concept" ? "I will explain this concept in simple terms. What would you like to know first?" : scenario === "Restaurant conversation" ? "Hello, could I see the menu, please?" : scenario === "Travel and directions" ? "Excuse me, could you help me find the train station?" : scenario === "Phone call" ? "Hello, this is Umar speaking. May I speak with the right person, please?" : "Hi! I want to practice my English. Can we start with a simple question?")}>Help me get started <span>↗</span></button>
            </div>
          ) : messages.map((message, index) => (
            <div className={`chat-message ${message.role === "user" ? "from-user" : "from-assistant"}`} key={`${index}-${message.role}`}>
              <span className="message-avatar">{message.role === "user" ? "U" : "✦"}</span>
              <div className="message-content"><span className="message-author">{message.role === "user" ? "You" : "SpeakUp AI"}</span><p>{message.content || (isStreaming ? "Thinking…" : "")}</p>
                {message.role === "assistant" && message.content.trim() && <button className="inline-action" type="button" onClick={() => speak(message.content)}>🔊 Listen</button>}
              </div>
            </div>
          ))}
          {error && <p className="chat-error" role="alert">{error}</p>}
          <div ref={conversationEnd} />
        </div>
        <form className="chat-composer" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="chat-message">Your message</label>
          <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write what you would like to say…" rows={2} maxLength={4000} disabled={isStreaming || listening || sessionExpired}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          <div className="composer-footer"><span>Enter to send · Shift + Enter for a new line</span><div className="composer-actions">
            <button className="button button-voice" type="button" aria-label={listening && !pronunciationMode ? "Stop microphone" : "Start voice input"} title={speechSupported ? "Speak your message" : "Voice input is not supported in this browser"} onClick={() => listening ? stopListening() : startListening("compose")} disabled={isStreaming || !speechSupported || voiceSessionState === "active"}>{listening && !pronunciationMode ? "■ Stop mic" : "🎙 Speak"}</button>
            <button className="button button-dark send-button" type="submit" disabled={isStreaming || listening || sessionExpired || !draft.trim()}>{sessionExpired ? "Time is up" : isStreaming ? "Thinking…" : "Send message"} <span>↗</span></button>
          </div></div>
        </form>
        {voiceError && <p className="voice-status" role="status">{voiceError}</p>}
        {hasReply && <div className="feedback-actions"><div><strong>Review your session</strong><p>Get a conversation summary, corrections, vocabulary, strengths, and a follow-up exercise.</p></div><div className="session-review-actions"><button className="notebook-secondary" type="button" onClick={requestFollowUp} disabled={isStreaming || messages[messages.length - 1]?.role !== "assistant"}>{isStreaming ? "Thinking…" : "Ask a follow-up question"}</button><button className="notebook-secondary" type="button" onClick={requestSimplerExplanation} disabled={isStreaming || messages[messages.length - 1]?.role !== "assistant"}>{isStreaming ? "Thinking…" : "Explain more simply"}</button><button className="notebook-secondary" type="button" onClick={() => requestFeedback()} disabled={feedbackLoading || isStreaming}>{feedbackLoading ? "Reviewing…" : "Get feedback"}</button><button className="button button-dark" type="button" onClick={requestSessionSummary} disabled={summaryLoading || isStreaming}>{summaryLoading ? "Summarizing…" : "Summarize session"} <span>✦</span></button></div></div>}
        {feedbackError && <p className="chat-error" role="alert">{feedbackError}</p>}
        {summaryError && <p className="chat-error" role="alert">{summaryError}</p>}
        {sessionSummary && <section className="session-summary-panel" aria-label="Session summary" aria-live="polite">
          <div className="feedback-title"><span className="stat-icon lavender">✓</span><div><p className="eyebrow">SESSION REVIEW</p><h3>Your learning summary</h3></div></div>
          <p className="session-summary-intro">{sessionSummary.topicSummary}</p>
          {sessionSummary.keyPoints.length > 0 && <><p className="feedback-label">Key points</p><ul className="feedback-tips">{sessionSummary.keyPoints.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
          {sessionSummary.corrections.length > 0 && <><p className="feedback-label">Useful corrections</p><div className="summary-corrections">{sessionSummary.corrections.map((item, index) => <article key={index}><p><span>Before</span>{item.original}</p><p><span>Try</span>{item.improved}</p><small>{item.reason}</small></article>)}</div></>}
          {sessionSummary.vocabulary.length > 0 && <><p className="feedback-label">Vocabulary to remember</p><div className="summary-vocabulary">{sessionSummary.vocabulary.map((item, index) => <article key={index}><strong>{item.phrase}</strong><p>{item.meaning}</p></article>)}</div></>}
          {sessionSummary.strengths.length > 0 && <><p className="feedback-label">What went well</p><ul className="feedback-tips">{sessionSummary.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
          {sessionSummary.improvements.length > 0 && <><p className="feedback-label">Try next time</p><ul className="feedback-tips">{sessionSummary.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
          <div className="summary-follow-up"><p className="eyebrow">YOUR NEXT EXERCISE</p><p>{sessionSummary.followUpExercise}</p></div>
          <p className="fluency-disclaimer">This is AI-generated learning guidance based on this transcript, not a validated proficiency assessment.</p>
        </section>}
        {feedback && <section className="feedback-panel" aria-label="English feedback">
          <div className="feedback-title"><span className="stat-icon lavender">✦</span><div><p className="eyebrow">YOUR PERSONAL COACH</p><h3>English feedback</h3></div></div>
          <p className="feedback-label">You wrote</p><blockquote className="original-sentence">{feedback.originalSentence}</blockquote>
          <p className="feedback-label">Corrected version</p><blockquote className="corrected-sentence">{feedback.correctedSentence}</blockquote><p className="feedback-explanation">{feedback.explanation}</p>
          {feedback.issues.length > 0 && <><p className="feedback-label">What to focus on</p><div className="feedback-issues">{feedback.issues.map((issue, index) => <article className="feedback-issue" key={index}><div className="feedback-issue-tags"><span className={issue.importance === "important" ? "issue-priority issue-important" : "issue-priority issue-optional"}>{issue.importance === "important" ? "Important correction" : "Optional improvement"}</span><span className="issue-category">{issue.category === "grammar" ? "Grammar" : "Natural phrasing"}</span></div><p><span>Before</span> {issue.original}</p><p><span>Try</span> {issue.corrected}</p><small>{issue.explanation}</small></article>)}</div></>}
          {feedback.tips.length > 0 && <><p className="feedback-label">Quick tips</p><ul className="feedback-tips">{feedback.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul></>}
          <div className="feedback-practice-prompt"><div><p className="feedback-label">Try it yourself</p><p>{feedback.practicePrompt}</p></div><button className="notebook-secondary" type="button" onClick={() => setDraft(feedback.practicePrompt)}>Practice this prompt</button></div>
          <div className="pronunciation-practice"><div><p className="feedback-label">Pronunciation practice</p><p>{feedback.pronunciationTip}</p><small>Word-match is an approximate transcript comparison, not a phoneme-level pronunciation score.</small></div><div className="pronunciation-controls"><button className="button button-voice" type="button" onClick={() => speak(feedback.correctedSentence)}>🔊 Hear it</button>{speechSupported && <button className="button button-voice" type="button" disabled={listening} onClick={() => startListening("pronunciation")}>🎙 Repeat it</button>}</div>
            {pronunciationAssessment && <div className="match-score" role="status">
              <strong>{pronunciationAssessment.score}%</strong>
              <div><span>ordered transcript match (approximate)</span>
                {pronunciationAssessment.missingWords.length > 0 && <p>Words to practice: {pronunciationAssessment.missingWords.join(", ")}</p>}
                {pronunciationAssessment.extraWords.length > 0 && <p>Extra or substituted words: {pronunciationAssessment.extraWords.join(", ")}</p>}
                {!pronunciationAssessment.missingWords.length && !pronunciationAssessment.extraWords.length && <p>All target words appear in the recognized transcript.</p>}
              </div>
            </div>}
          </div>
          <section className="phoneme-assessment" aria-label="Phoneme-level pronunciation assessment">
            <div><p className="feedback-label">Phoneme-level assessment</p><p>Record yourself saying the corrected sentence. A local speech model compares the sounds you produce with the target sentence.</p><small>Audio is sent to the pronunciation service configured for this app. Run the companion service locally to keep recordings on your own machine.</small></div>
            <div className="phoneme-record-controls">{phonemeRecording
              ? <button className="button button-danger-outline" type="button" onClick={stopPhonemeRecording}>Stop and assess</button>
              : <button className="button button-voice" type="button" onClick={() => void startPhonemeRecording()} disabled={isStreaming || listening || phonemeAssessmentLoading}>{phonemeAssessmentLoading ? "Assessing sounds…" : "Record pronunciation"}</button>}</div>
            {phonemeAssessmentError && <p className="phoneme-assessment-error" role="alert">{phonemeAssessmentError}</p>}
            {phonemeAssessmentLoading && <p className="phoneme-assessment-loading" role="status">Analyzing your recording against the target sentence…</p>}
            {phonemeAssessment && <div className="phoneme-assessment-result" aria-live="polite">
              <div className="phoneme-score"><strong>{phonemeAssessment.score}</strong><span>/100 pronunciation estimate</span></div>
              <p><strong>Model heard:</strong> {phonemeAssessment.transcript || "No word transcript returned."}</p>
              {phonemeAssessment.errors.length > 0 ? <div className="phoneme-issue-list"><p className="feedback-label">Sounds to practice</p>{phonemeAssessment.errors.map((issue, index) => <article className="phoneme-issue" key={index}><strong>{issue.word}</strong><p>Target sounds: <code>{issue.expected || "—"}</code></p><p>Heard sounds: <code>{issue.actual || "Not detected"}</code></p>{issue.phones.length > 0 && <small>{issue.phones.map((phone) => phone.expected + " → " + (phone.heard ?? "missing")).join(" · ")}</small>}</article>)}</div> : <p>No major phoneme differences were reported for this recording. Repeat once more to check consistency.</p>}
              {phonemeAssessment.phonemeErrorRate !== null && <small>Phoneme error rate: {Math.round(phonemeAssessment.phonemeErrorRate * 100)}% · Word error rate: {phonemeAssessment.wordErrorRate === null ? "unavailable" : Math.round(phonemeAssessment.wordErrorRate * 100) + "%"}</small>}
            </div>}
          </section>
          {feedback.vocabulary.length > 0 && <><p className="feedback-label">Useful phrases to keep</p><div className="feedback-word-list">{feedback.vocabulary.map((item) => <article className="feedback-word" key={item.phrase}><div><strong>{item.phrase}</strong><p>{item.meaning}</p><small>{item.example}</small></div><button type="button" className="save-word-button" onClick={() => savePhrase(item)} disabled={savedPhrases.includes(item.phrase)}>{savedPhrases.includes(item.phrase) ? "✓ Saved" : "+ Save"}</button></article>)}</div></>}
        </section>}
        <p className="chat-privacy-note">Chat and learning history stay in this browser/local Ollama setup. Speech recognition and speech playback use your browser; browser support varies. Learning data is stored locally on this device.</p>
      </section>
    </>
  );
}
