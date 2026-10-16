"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSessions, saveVocabulary, upsertSession, type PracticeSession } from "@/lib/learning-storage";
import { assessTranscript, type TranscriptAssessment } from "@/lib/pronunciation-assessment";

type Scenario = { number: string; title: string; description: string; icon: string; tone: string };
type Message = { role: "user" | "assistant"; content: string };
type Feedback = {
  correctedSentence: string;
  explanation: string;
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

function createId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PracticeExperience({ prompts }: { prompts: Scenario[] }) {
  const [scenario, setScenario] = useState(prompts[0]?.title ?? "Free conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [pronunciationAssessment, setPronunciationAssessment] = useState<TranscriptAssessment | null>(null);
  const [pronunciationMode, setPronunciationMode] = useState(false);
  const [savedPhrases, setSavedPhrases] = useState<string[]>([]);
  const [savedSessions, setSavedSessions] = useState<PracticeSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const conversationEnd = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<string | null>(null);

  useEffect(() => {
    conversationEnd.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const speech = window as SpeechWindow;
      setSpeechSupported(Boolean(speech.SpeechRecognition || speech.webkitSpeechRecognition));
      setSavedSessions(getSessions());
    }, 0);
    return () => {
      window.clearTimeout(timer);
      recognitionRef.current?.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  function chooseScenario(title: string) {
    if (isStreaming || listening) return;
    setScenario(title);
    resetConversation();
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceError("Text-to-speech is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
    setVoiceError("");
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
      if (mode === "compose") {
        setDraft((current) => current.trim() ? current.trim() + " " + transcript : transcript);
      } else if (feedback) {
        setPronunciationAssessment(assessTranscript(feedback.correctedSentence, transcript));
      }
      setVoiceError("");
    };
    recognition.onerror = (event) => {
      setVoiceError(event.error === "not-allowed"
        ? "Microphone access was denied. Allow microphone access in your browser settings."
        : `Voice input failed (${event.error}). You can still type your message.`);
    };
    recognition.onend = () => {
      setListening(false);
      setPronunciationMode(false);
      recognitionRef.current = null;
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

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
    setPronunciationMode(false);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isStreaming) return;

    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setDraft("");
    setError("");
    setFeedback(null);
    setFeedbackError("");
    setPronunciationAssessment(null);
    setIsStreaming(true);

    if (!sessionIdRef.current) {
      sessionIdRef.current = createId();
      sessionStartedAtRef.current = new Date().toISOString();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, messages: nextMessages }),
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
      if (!assistantText.trim()) setError("The AI returned an empty response. Please try again.");
      else {
        const startedAt = sessionStartedAtRef.current ?? new Date().toISOString();
        const updatedAt = new Date().toISOString();
        upsertSession({
          id: sessionIdRef.current ?? createId(),
          scenario,
          startedAt,
          updatedAt,
          durationSeconds: Math.max(1, Math.round((new Date(updatedAt).getTime() - new Date(startedAt).getTime()) / 1000)),
          messageCount: completeMessages.filter((message) => message.role === "user").length,
          learnerMessages: completeMessages.filter((message) => message.role === "user").map((message) => message.content).slice(-40),
          messages: completeMessages.slice(-100),
        });
        setSavedSessions(getSessions());
      }
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setMessages(nextMessages);
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  async function requestFeedback() {
    const learnerMessage = [...messages].reverse().find((message) => message.role === "user")?.content;
    const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim())?.content;
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

  function resetConversation() {
    if (isStreaming) abortRef.current?.abort();
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setMessages([]);
    setDraft("");
    setError("");
    setFeedback(null);
    setFeedbackError("");
    setPronunciationAssessment(null);
    setSavedPhrases([]);
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
    setMessages(restoredMessages);
    setDraft("");
    setError("");
    setFeedback(null);
    setFeedbackError("");
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
          {prompts.map((prompt) => (
            <button className={`scenario-card scenario-choice ${scenario === prompt.title ? "selected" : ""}`} type="button" key={prompt.number} onClick={() => chooseScenario(prompt.title)} aria-pressed={scenario === prompt.title} disabled={isStreaming || listening}>
              <span className="scenario-top"><span className={`scenario-icon ${prompt.tone}`}>{prompt.icon}</span><span className="scenario-number">{prompt.number}</span></span>
              <span className="scenario-title">{prompt.title}</span><span className="scenario-description">{prompt.description}</span>
              <span className="scenario-bottom"><span>Guided conversation</span><span className="scenario-arrow">{scenario === prompt.title ? "✓" : "↗"}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="chat-panel" aria-label="AI English conversation">
        <div className="chat-header">
          <div className="chat-coach-mark">✦</div>
          <div className="chat-header-copy"><strong>Your AI conversation partner</strong><span>Topic: {scenario}</span></div>
          <div className="session-history-controls">
            <label className="sr-only" htmlFor="saved-session">Saved conversations</label>
            <select id="saved-session" value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} disabled={isStreaming || listening}>
              <option value="">Recent conversations ({savedSessions.length})</option>
              {savedSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.scenario} · {new Date(session.updatedAt).toLocaleDateString()} · {session.messageCount} messages
                </option>
              ))}
            </select>
            <button className="chat-reset" type="button" onClick={() => {
              const selected = savedSessions.find((session) => session.id === selectedSessionId);
              if (selected) restoreSession(selected);
            }} disabled={!selectedSessionId || isStreaming || listening}>Restore</button>
            <button className="chat-reset" type="button" onClick={resetConversation} disabled={!messages.length && !error && !feedback}>New conversation</button>
          </div>
        </div>
        <div className="chat-transcript" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <span className="chat-welcome-spark">✦</span><h3>Ready when you are.</h3>
              <p>Say hello, tell me about your day, or ask to practice a conversation about <strong>{scenario.toLowerCase()}</strong>.</p>
              <button type="button" className="suggestion-chip" onClick={() => setDraft("Hi! I want to practice my English. Can we start with a simple question?")}>Help me get started <span>↗</span></button>
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
          <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write what you would like to say…" rows={2} maxLength={4000} disabled={isStreaming || listening}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          <div className="composer-footer"><span>Enter to send · Shift + Enter for a new line</span><div className="composer-actions">
            {speechSupported && <button className="button button-voice" type="button" onClick={() => listening ? stopListening() : startListening("compose")} disabled={isStreaming}>{listening && !pronunciationMode ? "Stop mic" : "🎙 Speak"}</button>}
            <button className="button button-dark send-button" type="submit" disabled={isStreaming || listening || !draft.trim()}>{isStreaming ? "Thinking…" : "Send message"} <span>↗</span></button>
          </div></div>
        </form>
        {voiceError && <p className="voice-status" role="status">{voiceError}</p>}
        {hasReply && <div className="feedback-actions"><div><strong>Improve your English</strong><p>Get a natural correction, quick tips, and useful phrases from this exchange.</p></div><button className="button button-dark" type="button" onClick={requestFeedback} disabled={feedbackLoading || isStreaming}>{feedbackLoading ? "Reviewing…" : "Get feedback"} <span>✦</span></button></div>}
        {feedbackError && <p className="chat-error" role="alert">{feedbackError}</p>}
        {feedback && <section className="feedback-panel" aria-label="English feedback">
          <div className="feedback-title"><span className="stat-icon lavender">✦</span><div><p className="eyebrow">YOUR PERSONAL COACH</p><h3>English feedback</h3></div></div>
          <p className="feedback-label">A more natural sentence</p><blockquote className="corrected-sentence">{feedback.correctedSentence}</blockquote><p className="feedback-explanation">{feedback.explanation}</p>
          {feedback.tips.length > 0 && <><p className="feedback-label">Quick tips</p><ul className="feedback-tips">{feedback.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul></>}
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
          {feedback.vocabulary.length > 0 && <><p className="feedback-label">Useful phrases to keep</p><div className="feedback-word-list">{feedback.vocabulary.map((item) => <article className="feedback-word" key={item.phrase}><div><strong>{item.phrase}</strong><p>{item.meaning}</p><small>{item.example}</small></div><button type="button" className="save-word-button" onClick={() => savePhrase(item)} disabled={savedPhrases.includes(item.phrase)}>{savedPhrases.includes(item.phrase) ? "✓ Saved" : "+ Save"}</button></article>)}</div></>}
        </section>}
        <p className="chat-privacy-note">Chat and learning history stay in this browser/local Ollama setup. Speech recognition and speech playback use your browser; browser support varies. Learning data is stored locally on this device.</p>
      </section>
    </>
  );
}
