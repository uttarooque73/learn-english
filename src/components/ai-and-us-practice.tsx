"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assessTranscript } from "@/lib/pronunciation-assessment";
import { speakText, stopSpeaking } from "@/lib/speech-playback";

type Tab = "discussion" | "paragraph";
type Level = "Beginner" | "Intermediate" | "Advanced";
type PracticeLine = {
  id: string;
  text: string;
  transcript: string;
  score: number | null;
  missingWords: string[];
  extraWords: string[];
  status: "pending" | "listening" | "complete";
};
type SavedParagraph = { id: string; title: string; text: string; level: Level; createdAt: string };
type Attempt = { id: string; paragraphId: string; target: string; transcript: string; score: number | null; createdAt: string; missingWords: string[]; extraWords: string[] };
type BrowserRecognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>>; resultIndex?: number }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition };

const samples: Record<Level, string> = {
  Beginner: "Every morning, I wake up early and prepare a healthy breakfast. Then I review my plans for the day. I try to learn something new and speak English whenever I get the chance.",
  Intermediate: "Learning a language is a gradual process. I make progress when I practise consistently, notice my mistakes, and try again. Even a short conversation can teach me a useful expression that I can use at work or in daily life.",
  Advanced: "Effective communication requires more than grammatical accuracy. It involves listening carefully, adapting your language to the situation, and expressing complex ideas with clarity. Reflecting on each conversation helps turn occasional insights into lasting habits.",
};
const topics = ["Random Topic", "Daily Life", "Technology", "Software Development", "Work and Meetings", "Travel", "Food and Cooking", "Business", "Science", "Custom Topic"];
const id = () => globalThis.crypto?.randomUUID?.() ?? `practice-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((line) => line.trim()).filter(Boolean) ?? [];
}

export function AiAndUsPractice() {
  const [tab, setTab] = useState<Tab>("discussion");
  const [topic, setTopic] = useState("Random Topic");
  const [customTopic, setCustomTopic] = useState("");
  const [level, setLevel] = useState<Level>("Intermediate");
  const [lines, setLines] = useState<PracticeLine[]>([]);
  const [lineIndex, setLineIndex] = useState(0);
  const [paragraphTitle, setParagraphTitle] = useState("My practice paragraph");
  const [paragraph, setParagraph] = useState(samples.Intermediate);
  const [paragraphs, setParagraphs] = useState<SavedParagraph[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [activeParagraphId, setActiveParagraphId] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Ready to practise");
  const [listening, setListening] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [rate, setRate] = useState(0.85);
  const [busy, setBusy] = useState(false);
  const [paragraphSaving, setParagraphSaving] = useState(false);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const listeningRef = useRef(false);
  const currentLineRef = useRef<string | null>(null);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    try { recognitionRef.current?.stop(); } catch { /* Recognition may already be stopped. */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/ai-and-us", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load practice history.");
      const data = await response.json() as { paragraphs: SavedParagraph[]; attempts: Attempt[] };
      setParagraphs(data.paragraphs);
      setAttempts(data.attempts);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load practice history.");
    }
  }, []);

  useEffect(() => { void loadHistory(); return () => { listeningRef.current = false; try { recognitionRef.current?.stop(); } catch { /* no-op */ } stopSpeaking(); }; }, [loadHistory]);

  const current = lines[lineIndex];
  const paragraphLines = useMemo(() => splitSentences(paragraph), [paragraph]);


  const speak = (text: string, done?: () => void) => {
    stopListening();
    const started = speakText(text, done, rate);
    setStatus(started ? "AI reading aloud" : "Text-to-speech is not supported in this browser.");
    return started;
  };

  const startRecognition = (lineText: string, mode: Tab) => {
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setMessage("Speech recognition is not supported in this browser. Try a current version of Chrome or Edge, or use the text comparison option.");
      setStatus("Speech recognition unavailable");
      return;
    }
    stopListening();
    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    currentLineRef.current = lineText;
    listeningRef.current = true;
    setListening(true);
    setStatus("Listening — read the sentence aloud");
    setMessage("");
    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.[0]?.transcript) parts.push(result[0].transcript);
      }
      const transcript = parts.join(" ").trim();
      if (!transcript) return;
      if (mode === "discussion") {
        setLines((previous) => previous.map((line) => line.id === currentLineRef.current ? { ...line, transcript } : line));
      } else {
        setMessage("Recognized: " + transcript);
      }
      const finalResult = event.results.length > 0 && Boolean((event.results[event.results.length - 1] as unknown as { isFinal?: boolean })?.isFinal);
      if (finalResult) {
        const assessment = assessTranscript(lineText, transcript);
        if (mode === "discussion") {
          setLines((previous) => previous.map((line) => line.id === currentLineRef.current ? { ...line, transcript, score: assessment.score, missingWords: assessment.missingWords, extraWords: assessment.extraWords, status: "complete" } : line));
          setStatus("Sentence reviewed");
        } else {
          void saveAttempt(lineText, transcript, assessment.score, assessment.missingWords, assessment.extraWords);
        }
        listeningRef.current = false;
        setListening(false);
      }
    };
    recognition.onerror = (event) => {
      listeningRef.current = false;
      setListening(false);
      setStatus("Could not recognize speech");
      setMessage(event.error === "not-allowed" ? "Please allow microphone access in your browser settings." : "We couldn't clearly recognize that reading. Try again in a quieter place.");
    };
    recognition.onend = () => {
      if (listeningRef.current) {
        listeningRef.current = false;
        setListening(false);
      }
    };
    try { recognition.start(); } catch {
      listeningRef.current = false;
      setListening(false);
      setMessage("The microphone could not start. Close any other recording session and try again.");
    }
  };

  const beginDiscussion = () => {
    const chosen = topic === "Random Topic" ? ["Daily Life", "Technology", "Software Development", "Work and Meetings", "Travel", "Food and Cooking", "Business", "Science"][Math.floor(Math.random() * 8)] : topic;
    const name = chosen === "Custom Topic" ? customTopic.trim() || "daily life" : chosen;
    const levelLine = level === "Beginner" ? "Use simple, short English sentences." : level === "Advanced" ? "Use thoughtful, nuanced, natural English." : "Use natural everyday English.";
    const seed: PracticeLine[] = [
      { id: id(), text: `Today, let's talk about ${name.toLowerCase()}.`, transcript: "", score: null, missingWords: [], extraWords: [], status: "pending" },
      { id: id(), text: level === "Beginner" ? "Why do you like this topic?" : `What interests you most about ${name.toLowerCase()}, and why?`, transcript: "", score: null, missingWords: [], extraWords: [], status: "pending" },
      { id: id(), text: level === "Advanced" ? "How has your perspective on this subject changed over time?" : "Can you share an example from your own life?", transcript: "", score: null, missingWords: [], extraWords: [], status: "pending" },
      { id: id(), text: level === "Beginner" ? "What would you like to learn next?" : `What advice would you give someone who wants to learn more about ${name.toLowerCase()}?`, transcript: "", score: null, missingWords: [], extraWords: [], status: "pending" },
    ];
    setLines(seed);
    setLineIndex(0);
    setMessage(`Topic: ${name}. ${levelLine} Read each sentence aloud, then continue to the next one.`);
    setStatus("Discussion ready");
    if (autoPlay) window.setTimeout(() => speak(seed[0].text), 100);
  };

  const saveAttempt = async (target: string, transcript: string, score: number, missingWords: string[], extraWords: string[]) => {
    setStatus("Saving reading attempt");
    setStatus("Saving reading attempt");
    try {
      const response = await fetch("/api/ai-and-us", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "attempt", paragraphId: activeParagraphId || null, target, transcript, score, missingWords, extraWords }),
      });
      const data = await response.json() as { attempt?: Attempt; error?: string };
      if (!response.ok || !data.attempt) throw new Error(data.error || "Could not save this reading attempt.");
      setAttempts((previous) => [data.attempt!, ...previous].slice(0, 100));
      setMessage(`Reading saved. Transcript similarity: ${score}%. This compares recognized words, not acoustic pronunciation.`);
      setStatus("Attempt saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save reading attempt.");
      setStatus("Save failed");
    } finally { /* Attempt saving is independent from paragraph editing. */ }
  };

  const saveParagraph = async (): Promise<SavedParagraph | null> => {
    if (!paragraph.trim()) { setMessage("Enter a paragraph before saving it."); return null; }
    setParagraphSaving(true);
    try {
      const response = await fetch("/api/ai-and-us", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "paragraph", title: paragraphTitle, text: paragraph, level }),
      });
      const data = await response.json() as { paragraph?: SavedParagraph; error?: string };
      if (!response.ok || !data.paragraph) throw new Error(data.error || "Could not save paragraph.");
      setParagraphs((previous) => [data.paragraph!, ...previous.filter((item) => item.id !== data.paragraph!.id)].slice(0, 100));
      setActiveParagraphId(data.paragraph.id);
      setMessage("Paragraph saved to your learning history.");
      return data.paragraph;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save paragraph."); return null; }
    finally { setParagraphSaving(false); }
  };

  const nextDiscussionLine = () => {
    stopListening(); stopSpeaking();
    if (lineIndex >= lines.length - 1) { setStatus("Discussion complete"); setMessage("Nice work. Review each sentence's transcript comparison below, or start another topic."); return; }
    const nextIndex = lineIndex + 1;
    setLineIndex(nextIndex);
    setStatus("Next sentence");
    if (autoPlay) window.setTimeout(() => speak(lines[nextIndex].text), 100);
  };

  const startParagraphPractice = async () => {
    const split = splitSentences(paragraph);
    if (!split.length) { setMessage("Enter a paragraph to begin practising."); return; }
    let paragraphIdForAttempt = activeParagraphId;
    if (!paragraphIdForAttempt) {
      const saved = await saveParagraph();
      if (!saved) return;
      paragraphIdForAttempt = saved.id;
    }
    setActiveParagraphId(paragraphIdForAttempt);
    const practiceLines: PracticeLine[] = split.map((text) => ({ id: id(), text, transcript: "", score: null, missingWords: [], extraWords: [], status: "pending" }));
    setLines(practiceLines);
    setLineIndex(0);
    setMessage("Read one sentence at a time. Each completed attempt is saved to your database-backed history.");
    setStatus("Paragraph practice ready");
    if (autoPlay) window.setTimeout(() => speak(practiceLines[0].text), 100);
  };

  const practiceCurrentParagraphLine = () => {
    if (!current) return;
    startRecognition(current.text, tab);
  };

  const loadParagraph = (saved: SavedParagraph) => {
    setParagraphTitle(saved.title);
    setParagraph(saved.text);
    setLevel(saved.level);
    setActiveParagraphId(saved.id);
    setMessage(`Loaded "${saved.title}". You can practice it again or edit the text.`);
  };

  const retrySavedFeedback = (attempt: Attempt) => {
    const assessment = assessTranscript(attempt.target, attempt.transcript);
    setMessage(`Comparison: ${assessment.score}%. Missing words: ${assessment.missingWords.join(", ") || "none detected"}. Extra/substituted words: ${assessment.extraWords.join(", ") || "none detected"}. This is transcript matching, not a definitive pronunciation score.`);
  };

  const activeAttempts = activeParagraphId ? attempts.filter((attempt) => attempt.paragraphId === activeParagraphId) : attempts;

  return (
    <div className="aius-page">
      <section className="aius-hero">
        <div><span className="intro-label"><span className="status-dot" /> READ · SPEAK · GROW</span><h2>Make every sentence<br /><em>a little more natural.</em></h2><p>Read along with an AI discussion or bring your own paragraph. Practise at your pace and keep your progress in one place.</p></div>
        <div className="aius-hero-mark" aria-hidden="true"><span>Ab</span><small>your voice, your pace</small></div>
      </section>
      <div className="aius-tabs" role="tablist" aria-label="AI and Us practice modes">
        <button role="tab" aria-selected={tab === "discussion"} className={tab === "discussion" ? "active" : ""} onClick={() => { stopListening(); stopSpeaking(); setTab("discussion"); setLines([]); setLineIndex(0); }}>AI and Us Discussion</button>
        <button role="tab" aria-selected={tab === "paragraph"} className={tab === "paragraph" ? "active" : ""} onClick={() => { stopListening(); stopSpeaking(); setTab("paragraph"); setLines([]); setLineIndex(0); }}>Paragraph Practice</button>
      </div>

      {tab === "discussion" ? <section className="aius-panel">
        <div className="aius-section-heading"><div><span className="eyebrow">GUIDED READING</span><h3>AI and Us Discussion</h3><p>Choose a topic, listen to each sentence, then read it aloud.</p></div><span className="aius-status">{status}</span></div>
        <div className="aius-controls">
          <label>Topic<select value={topic} onChange={(event) => setTopic(event.target.value)}>{topics.map((item) => <option key={item}>{item}</option>)}</select></label>
          {topic === "Custom Topic" && <label>Custom topic<input value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} placeholder="What would you like to discuss?" maxLength={120} /></label>}
          <label>English level<select value={level} onChange={(event) => setLevel(event.target.value as Level)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
          <label className="aius-toggle"><input type="checkbox" checked={autoPlay} onChange={(event) => setAutoPlay(event.target.checked)} /> Automatically play AI sentence</label>
          <label>AI reading speed<input type="range" min="0.6" max="1.15" step="0.05" value={rate} onChange={(event) => setRate(Number(event.target.value))} /><small>{rate.toFixed(2)}× speed</small></label>
          <button className="button button-dark" onClick={beginDiscussion}>Start a discussion <span>→</span></button>
        </div>
        {lines.length > 0 && current && <div className="aius-reading-card">
          <div className="aius-reading-meta"><span>AI SENTENCE {lineIndex + 1} OF {lines.length}</span><span>{current.status === "complete" ? "✓ Reviewed" : current.status === "listening" || listening ? "● Listening" : "Read this sentence aloud"}</span></div>
          <p className="aius-target-sentence">{current.text}</p>
          <div className="aius-reading-actions">
            <button className="button button-light" onClick={() => speak(current.text)}>▶ Play sentence</button>
            <button className="button button-light" onClick={practiceCurrentParagraphLine} disabled={listening}>{listening ? "Listening…" : "🎙 Read aloud"}</button>
            <button className="button button-light" onClick={() => { stopListening(); startRecognition(current.text, tab); }}>Retry reading</button>
            <button className="button button-dark" onClick={nextDiscussionLine}>Next sentence <span>→</span></button>
          </div>
          {current.transcript && <div className="aius-comparison"><p><strong>Your reading</strong>{current.transcript}</p>{current.score !== null && <p><strong>Transcript similarity</strong>{current.score}%</p>}{current.missingWords.length > 0 && <p><strong>Words not recognized</strong>{current.missingWords.join(", ")}</p>}{current.extraWords.length > 0 && <p><strong>Extra or substituted words</strong>{current.extraWords.join(", ")}</p>}<small>Speech-to-text matching can be affected by accents and background noise; it does not independently prove a pronunciation error.</small></div>}
        </div>}
      </section> : <section className="aius-panel">
        <div className="aius-section-heading"><div><span className="eyebrow">YOUR OWN TEXT</span><h3>Paragraph Practice</h3><p>Paste any paragraph, save it, and practise reading it sentence by sentence.</p></div><span className="aius-status">{status}</span></div>
        <div className="aius-editor">
          <label>Paragraph title<input value={paragraphTitle} onChange={(event) => { setParagraphTitle(event.target.value); setActiveParagraphId(""); }} maxLength={120} /></label>
          <label>English level<select value={level} onChange={(event) => setLevel(event.target.value as Level)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
          <label>Paragraph<textarea value={paragraph} onChange={(event) => { setParagraph(event.target.value); setActiveParagraphId(""); }} rows={7} maxLength={12000} placeholder="Paste or write a paragraph here…" /></label>
          <div className="aius-editor-actions"><button className="button button-light" onClick={() => setParagraph(samples[level])}>Load sample</button><button className="button button-light" onClick={() => speak(paragraph)}>▶ Listen to paragraph</button><button className="button button-dark" disabled={paragraphSaving} onClick={() => void saveParagraph()}>Save paragraph</button><button className="button button-dark" onClick={() => void startParagraphPractice()}>Start reading practice <span>→</span></button></div>
        </div>
        {paragraphs.length > 0 && <div className="aius-history"><h4>Saved paragraphs</h4>{paragraphs.map((saved) => <button key={saved.id} className={activeParagraphId === saved.id ? "aius-history-item selected" : "aius-history-item"} onClick={() => loadParagraph(saved)}><span><strong>{saved.title}</strong><small>{saved.level} · {splitSentences(saved.text).length} sentences</small></span><span>Open →</span></button>)}</div>}
        {activeAttempts.length > 0 && <div className="aius-history"><h4>Reading attempts ({activeAttempts.length})</h4>{activeAttempts.map((attempt) => <article className="aius-attempt" key={attempt.id}><div><strong>{attempt.target}</strong><small>{new Date(attempt.createdAt).toLocaleString()}</small></div><span>{attempt.score === null ? "—" : `${attempt.score}% match`}</span><button className="text-link" onClick={() => retrySavedFeedback(attempt)}>Review</button></article>)}</div>}
      </section>}

      {message && <div className="aius-notice" role="status"><span>{message}</span><button aria-label="Dismiss message" onClick={() => setMessage("")}>×</button></div>}
      {tab === "paragraph" && lines.length > 0 && current && <section className="aius-panel aius-active-practice"><div className="aius-section-heading"><div><span className="eyebrow">CURRENT SENTENCE</span><h3>Sentence {lineIndex + 1} of {lines.length}</h3></div><span className="aius-status">{current.status}</span></div><p className="aius-target-sentence">{current.text}</p><div className="aius-reading-actions"><button className="button button-light" onClick={() => speak(current.text)}>▶ Listen</button><button className="button button-dark" onClick={practiceCurrentParagraphLine} disabled={listening}>🎙 {listening ? "Listening…" : "Read aloud"}</button><button className="button button-dark" onClick={nextDiscussionLine}>Next sentence →</button></div>{current.transcript && <div className="aius-comparison"><p><strong>Your reading</strong>{current.transcript}</p>{current.score !== null && <p><strong>Transcript similarity</strong>{current.score}%</p>}{current.missingWords.length > 0 && <p><strong>Words not recognized</strong>{current.missingWords.join(", ")}</p>}{current.extraWords.length > 0 && <p><strong>Extra or substituted words</strong>{current.extraWords.join(", ")}</p>}</div>}</section>}
      <p className="aius-disclaimer">Reading-match scores compare browser speech transcripts with the target text. They are not a definitive phoneme-level pronunciation assessment. Microphone speech recognition availability varies by browser.</p>
    </div>
  );
}
