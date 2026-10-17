"use client";

import { useEffect, useRef, useState } from "react";
import { assessTranscript, type TranscriptAssessment } from "@/lib/pronunciation-assessment";
import { speakText } from "@/lib/speech-playback";

const DEFAULT_LINES = [
  "Could you give me a moment to think about that?",
  "I will follow up with the team and share an update.",
  "I understand your point, and I would like to add one thing.",
  "Would you mind explaining that in a little more detail?",
  "The main challenge is finding a solution that works for everyone.",
];

type Recognition = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
type AcousticMetrics = { durationSeconds: number; speechRateWpm: number; pauseCount: number; pitchRangeHz: number | null; intonation: string };
type ShadowingHistoryEntry = { id: string; target: string; transcript: string; score: number | null; createdAt: string; favorite: boolean; activity: "listen" | "attempt" };
type ShadowingTab = "current" | "history";

async function analyzeRecording(blob: Blob, wordCount: number): Promise<AcousticMetrics | null> {
  const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  const context = new AudioContextCtor();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const durationSeconds = buffer.duration;
    const frameSize = Math.max(1, Math.floor(buffer.sampleRate * 0.02));
    const energies: number[] = [];
    for (let start = 0; start < samples.length; start += frameSize) {
      let sum = 0;
      const end = Math.min(samples.length, start + frameSize);
      for (let i = start; i < end; i++) sum += samples[i] * samples[i];
      energies.push(Math.sqrt(sum / Math.max(1, end - start)));
    }
    const peak = Math.max(0, ...energies);
    const threshold = Math.max(0.008, peak * 0.13);
    let pauses = 0, inPause = false, pauseFrames = 0;
    for (const energy of energies) {
      if (energy < threshold) { pauseFrames++; inPause = true; }
      else {
        if (inPause && pauseFrames >= 9) pauses++;
        inPause = false; pauseFrames = 0;
      }
    }
    if (inPause && pauseFrames >= 9) pauses++;
    const pitches: number[] = [];
    const pitchFrame = Math.floor(buffer.sampleRate * 0.04);
    for (let start = 0; start + pitchFrame < samples.length; start += pitchFrame) {
      let energy = 0;
      for (let i = start; i < start + pitchFrame; i++) energy += samples[i] * samples[i];
      if (energy / pitchFrame < 0.00004) continue;
      const minLag = Math.floor(buffer.sampleRate / 350);
      const maxLag = Math.min(Math.floor(buffer.sampleRate / 75), pitchFrame - 1);
      let bestLag = 0, bestCorrelation = 0;
      for (let lag = minLag; lag <= maxLag; lag++) {
        let correlation = 0;
        for (let i = start; i < start + pitchFrame - lag; i++) correlation += samples[i] * samples[i + lag];
        if (correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag; }
      }
      if (bestLag && bestCorrelation > 0) pitches.push(buffer.sampleRate / bestLag);
    }
    const pitchRangeHz = pitches.length >= 3 ? Math.round(Math.max(...pitches) - Math.min(...pitches)) : null;
    return {
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      speechRateWpm: durationSeconds > 0 ? Math.round(wordCount / durationSeconds * 60) : 0,
      pauseCount: pauses,
      pitchRangeHz,
      intonation: pitchRangeHz === null ? "Not enough clear voiced audio to estimate pitch variation." : pitchRangeHz < 35 ? "Your pitch stayed fairly level. Try emphasizing key words and letting your voice rise or fall naturally." : "Your voice showed pitch variation. Try matching the model sentence's emphasis and sentence-ending intonation.",
    };
  } finally {
    await context.close();
  }
}

export function ShadowingPractice() {
  const [lines, setLines] = useState(DEFAULT_LINES);
  const [customLine, setCustomLine] = useState("");
  const [index, setIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState("");
  const [listening, setListening] = useState(false);
  const [rate, setRate] = useState(0.85);
  const [supported, setSupported] = useState(false);
  const [recordingSupported, setRecordingSupported] = useState(false);
  const [acoustic, setAcoustic] = useState<AcousticMetrics | null>(null);
  const [phonemeResult, setPhonemeResult] = useState<{ score: number; errors: { word: string; expected: string; actual: string | null; phones: { expected: string; heard: string | null }[] }[] } | null>(null);
  const [phonemeMessage, setPhonemeMessage] = useState("");
  const [history, setHistory] = useState<ShadowingHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<ShadowingTab>("current");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "favorites">("all");
  const [historyNotice, setHistoryNotice] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const w = window as SpeechWindow;
      setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
      const requestedTarget = new URLSearchParams(window.location.search).get("text")?.trim();
      if (requestedTarget && requestedTarget.length <= 240) { setLines([requestedTarget, ...DEFAULT_LINES]); setIndex(0); setFeedback("Ready to practise the selected vocabulary item."); }
      void fetch("/api/shadowing-history", { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json() as { history?: ShadowingHistoryEntry[]; error?: string };
          if (!response.ok) throw new Error(payload.error || "Could not load practice history.");
          setHistory(Array.isArray(payload.history) ? payload.history : []);
        })
        .catch(() => setHistoryNotice("Could not load practice history from the database. Refresh to try again."));
      setRecordingSupported(typeof navigator.mediaDevices?.getUserMedia === "function" && typeof window.MediaRecorder === "function");
    }, 0);
    return () => {
      window.clearTimeout(timer);
      recognitionRef.current?.stop();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      window.speechSynthesis?.cancel();
    };
  }, []);

  const sentence = lines[index] ?? lines[0];
  const comparison: TranscriptAssessment | null = transcript ? assessTranscript(sentence, transcript) : null;

  async function saveListenHistory(target: string) {
    try {
      const response = await fetch("/api/shadowing-history", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, transcript: "", score: null, activity: "listen" }),
      });
      const payload = await response.json() as { entry?: ShadowingHistoryEntry; error?: string };
      if (!response.ok || !payload.entry) throw new Error(payload.error || "Could not save listen history.");
      setHistory((current) => [payload.entry!, ...current].slice(0, 100));
      setHistoryNotice("Listened word or sentence saved to database history.");
    } catch {
      setHistoryNotice("Audio played, but its history could not be saved to the database.");
    }
  }

  function speakSentence() {
    if (!sentence || !speakText(sentence, undefined, rate)) {
      setFeedback("Text-to-speech is not supported in this browser.");
      return;
    }
    void saveListenHistory(sentence);
    setFeedback("Playing target audio. Saved to your history.");
  }

  async function startRepeat() {
    setTranscript(""); transcriptRef.current = ""; setFeedback(""); setAcoustic(null); setPhonemeResult(null); setPhonemeMessage("");
    const w = window as SpeechWindow;
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    let recognition: Recognition | null = null;
    if (Constructor) {
      recognition = new Constructor();
      recognition.lang = "en-US"; recognition.interimResults = true; recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const parts: string[] = [];
        for (let i = 0; i < event.results.length; i++) parts.push(event.results[i]?.[0]?.transcript ?? "");
        const nextTranscript = parts.join(" ").trim();
        transcriptRef.current = nextTranscript;
        setTranscript(nextTranscript);
      };
      recognition.onerror = (event) => setFeedback(event.error === "not-allowed" ? "Microphone permission was denied." : "Speech recognition stopped; your recording can still be assessed.");
      recognition.onend = () => {};
      recognitionRef.current = recognition;
    }
    try {
      if (navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream; chunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          if (!blob.size) { setPhonemeMessage("No audio was captured. Try recording again."); return; }
          try {
            const metrics = await analyzeRecording(blob, Math.max(1, transcript.trim().split(/\s+/).filter(Boolean).length));
            setAcoustic(metrics);
          } catch { setPhonemeMessage("Could not analyze audio timing in this browser. Transcript feedback is still available."); }
          const form = new FormData();
          form.append("audio", blob, "shadowing.webm");
          form.append("expectedText", sentence);
          setPhonemeMessage("Checking sound-level pronunciation…");
          try {
            const response = await fetch("/api/pronunciation", { method: "POST", body: form });
            const payload = await response.json() as { score?: number; transcript?: string; errors?: { word: string; expected: string; actual: string | null; phones: { expected: string; heard: string | null }[] }[]; error?: string };
            if (response.ok && typeof payload.score === "number") {
              setPhonemeResult({ score: payload.score, errors: payload.errors ?? [] });
              setPhonemeMessage("Sound-level assessment complete.");
            } else setPhonemeMessage(payload.error || "Phoneme-level scoring is unavailable; use the transcript and rhythm feedback below.");
          } catch { setPhonemeMessage("Phoneme-level scoring is unavailable. Start the optional local pronunciation service to enable it."); }
        };
        recorder.start();
      }
      if (recognition) {
        try { recognition.start(); } catch { /* The audio recording can still be assessed. */ }
      }
      setListening(true);
      setFeedback("Recording… repeat the sentence, then select Stop and assess.");
    } catch {
      setListening(false);
      setFeedback("Microphone access failed. Check browser permission and try again.");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function saveAttempt() {
    const spoken = transcriptRef.current.trim();
    const assessment = spoken ? assessTranscript(sentence, spoken) : null;
    try {
      const response = await fetch("/api/shadowing-history", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: sentence, transcript: spoken, score: assessment?.score ?? null }),
      });
      const payload = await response.json() as { entry?: ShadowingHistoryEntry; error?: string };
      if (!response.ok || !payload.entry) throw new Error(payload.error || "Could not save this attempt.");
      setHistory((current) => [payload.entry!, ...current].slice(0, 100));
      setHistoryNotice("Attempt saved to the database.");
    } catch {
      setHistoryNotice("Could not save this attempt to the database. Check your connection and try again.");
    }
  }

  async function toggleFavorite(entry: ShadowingHistoryEntry) {
    try {
      const response = await fetch("/api/shadowing-history", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, favorite: !entry.favorite }),
      });
      const payload = await response.json() as { entry?: ShadowingHistoryEntry; error?: string };
      if (!response.ok || !payload.entry) throw new Error(payload.error || "Could not update favourite.");
      setHistory((current) => current.map((item) => item.id === entry.id ? payload.entry! : item));
      setHistoryNotice(payload.entry.favorite ? "Added to favourites." : "Removed from favourites.");
    } catch {
      setHistoryNotice("Could not update this favourite in the database.");
    }
  }

  async function deleteAttempt(id: string) {
    try {
      const response = await fetch("/api/shadowing-history?id=" + encodeURIComponent(id), { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not delete attempt.");
      setHistory((current) => current.filter((item) => item.id !== id));
      setHistoryNotice("Practice attempt deleted.");
    } catch {
      setHistoryNotice("Could not delete this attempt from the database.");
    }
  }

  async function clearHistory() {
    try {
      const response = await fetch("/api/shadowing-history?all=1", { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not clear history.");
      setHistory([]);
      setHistoryNotice("Practice history cleared from the database.");
    } catch {
      setHistoryNotice("Could not clear history from the database.");
    }
  }

  function stopRepeat() {
    recognitionRef.current?.stop(); recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setListening(false);
    saveAttempt();
    setFeedback("Recording stopped. Reviewing your attempt…");
  }

  const filteredHistory = history.filter((entry) => (historyFilter === "all" || entry.favorite) && (!historyQuery.trim() || (entry.target + " " + entry.transcript).toLocaleLowerCase().includes(historyQuery.trim().toLocaleLowerCase())));

  return <div className="shadowing-page-layout"><div className="shadowing-tabs" role="tablist" aria-label="Shadowing practice views"><button type="button" role="tab" id="shadowing-current-tab" aria-selected={activeTab === "current"} aria-controls="shadowing-current-panel" className={activeTab === "current" ? "active" : ""} onClick={() => setActiveTab("current")}>Current practice</button><button type="button" role="tab" id="shadowing-history-tab" aria-selected={activeTab === "history"} aria-controls="shadowing-history-panel" className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>History <span>{history.length}</span></button></div><section id="shadowing-current-panel" role="tabpanel" aria-labelledby="shadowing-current-tab" hidden={activeTab !== "current"} className="learning-feature-panel shadowing-panel" aria-labelledby="shadowing-heading">
    <div className="learning-feature-heading"><div><p className="eyebrow">PRONUNCIATION DRILL</p><h2 id="shadowing-heading">Shadowing practice</h2><p>Listen, repeat, then review word accuracy, speaking pace, pauses, pitch variation, and optional phoneme-level feedback.</p></div><span className="feature-symbol" aria-hidden="true">◖♪</span></div>
    <label className="feature-field">Practice sentence or word<select value={index} onChange={(event) => { setIndex(Number(event.target.value)); setTranscript(""); transcriptRef.current = ""; setFeedback(""); setAcoustic(null); setPhonemeResult(null); }}>
      {lines.map((line, i) => <option key={i + "-" + line} value={i}>{line}</option>)}
    </select></label>
    <blockquote className="shadowing-sentence">{sentence}</blockquote>
    <div className="shadowing-controls"><label>Speaking speed <select value={rate} onChange={(event) => setRate(Number(event.target.value))}><option value={0.7}>Slow</option><option value={0.85}>Steady</option><option value={1}>Natural</option></select></label><button type="button" className="button button-outline" onClick={speakSentence}>▶ Listen</button>{!listening ? <button type="button" className="button button-primary" onClick={startRepeat}>🎙 Start recording</button> : <button type="button" className="button button-primary" onClick={stopRepeat}>Stop and assess</button>}<button type="button" className="text-link" onClick={() => { setIndex((index + 1) % lines.length); setTranscript(""); setFeedback(""); setAcoustic(null); setPhonemeResult(null); }}>Next line →</button></div>
    {transcript && comparison && <div className="shadowing-result"><strong>Your transcript</strong><p>{transcript}</p><div className="word-feedback" aria-label={`Word match ${comparison.score} percent`}>{comparison.expectedWords.map((word, i) => <span className={comparison.missingWords.includes(word) ? "word-miss" : "word-match"} key={i}>{word}</span>)}</div><p>Word-order similarity: {comparison.score}%.</p>{comparison.missingWords.length > 0 && <p>Review these words: {comparison.missingWords.join(", ")}.</p>}<small>Transcript similarity is not an accent score; browser speech recognition can mishear correct speech.</small></div>}
    {acoustic && <div className="shadowing-result"><strong>Rhythm and delivery</strong><div className="shadowing-metrics"><p><b>{acoustic.speechRateWpm}</b><span>estimated words/minute</span></p><p><b>{acoustic.pauseCount}</b><span>long pauses (≥180 ms)</span></p><p><b>{acoustic.pitchRangeHz === null ? "—" : `${acoustic.pitchRangeHz} Hz`}</b><span>estimated pitch range</span></p></div><p>{acoustic.intonation}</p><small>These are approximate acoustic coaching signals, not a validated prosody score. Pitch range is estimated from the recording.</small></div>}
    {phonemeResult && <div className="shadowing-result"><strong>Sound-level score: {phonemeResult.score}%</strong>{phonemeResult.errors.length ? <ul>{phonemeResult.errors.slice(0, 8).map((item, i) => <li key={item.word + i}><b>{item.word}</b>: expected {item.expected || "target sound"}{item.actual ? `, heard ${item.actual}` : ""}{item.phones.length ? ` (sounds: ${item.phones.map((phone) => `${phone.expected}→${phone.heard ?? "not detected"}`).join(", ")})` : ""}</li>)}</ul> : <p>No sound-level differences were returned by the assessment service.</p>}</div>}
    {feedback && <p className="feature-feedback" role="status">{feedback}</p>}
    {phonemeMessage && <p className="feature-note" role="status">{phonemeMessage}</p>}
    {!supported && <p className="feature-note">Browser speech recognition is unavailable. Audio recording and optional phoneme assessment may still work; otherwise, listen and repeat without transcript feedback.</p>}
    {!recordingSupported && <p className="feature-note">Audio recording is not supported here. Browser speech recognition can still provide word feedback where available.</p>}
    <form className="shadowing-custom-line" onSubmit={(event) => { event.preventDefault(); const line = customLine.trim(); if (!line || line.length > 240) return; setLines((current) => [...current, line]); setIndex(lines.length); setCustomLine(""); setTranscript(""); transcriptRef.current = ""; setFeedback(""); }}><label className="feature-field">Add a word or sentence to practise<input value={customLine} maxLength={240} onChange={(event) => setCustomLine(event.target.value)} placeholder="e.g. comfortable / I would appreciate your help." /></label><button type="submit" className="button button-outline" disabled={!customLine.trim()}>Add to practice list</button></form>
  </section>
  <section id="shadowing-history-panel" role="tabpanel" aria-labelledby="shadowing-history-tab" hidden={activeTab !== "history"} className="learning-feature-panel shadowing-history-panel" aria-labelledby="shadowing-history-heading">
    <div className="learning-feature-heading"><div><p className="eyebrow">YOUR PRACTICE LOG</p><h2 id="shadowing-history-heading">Sentence & word history</h2><p>Review previous attempts, replay a target, and practise tricky phrases again. History is saved in the application database.</p></div><span className="feature-symbol" aria-hidden="true">↺</span></div>
    <div className="shadowing-history-summary">
      <div><strong>{history.length}</strong><span>Saved attempts</span></div>
      <div><strong>{history.filter((item) => item.favorite).length}</strong><span>Favourites</span></div>
      <div><strong>{history.filter((item) => item.score !== null).length ? Math.round(history.filter((item) => item.score !== null).reduce((sum, item) => sum + (item.score ?? 0), 0) / history.filter((item) => item.score !== null).length) + "%" : "—"}</strong><span>Average word match</span></div>
    </div>
    <div className="shadowing-history-tools">
      <label className="feature-field">Search your history<input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search a word or sentence" /></label>
      <label className="feature-field">Show<select value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value as "all" | "favorites")}><option value="all">All attempts</option><option value="favorites">Favourites only</option></select></label>
      <button type="button" className="button button-outline" disabled={!history.length} onClick={() => { if (window.confirm("Delete all shadowing history from your account?")) { void clearHistory(); } }}>Clear history</button>
    </div>
    {historyNotice && <p className="feature-note" role="status">{historyNotice}</p>}
    {filteredHistory.length === 0 ? <div className="shadowing-history-empty"><strong>{history.length ? "No matching attempts" : "Your practice history will appear here"}</strong><p>Every target you listen to is saved here automatically. Record and assess yourself to save speaking attempts too.</p></div> :
      <div className="shadowing-history-list">{filteredHistory.map((entry) => <article className="shadowing-history-entry" key={entry.id}>
        <div className="shadowing-history-entry-top"><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time><span>{entry.score === null ? "No transcript captured" : entry.score + "% word match"}</span></div>
        <p className="shadowing-history-target">{entry.target}</p><p className="shadowing-history-kind">{entry.activity === "listen" ? "🔊 Listened · audio history" : "🎙 Speaking attempt"}</p>
        {entry.transcript ? <p className="shadowing-history-transcript"><strong>You said:</strong> {entry.transcript}</p> : <p className="shadowing-history-transcript">No transcript was captured for this attempt.</p>}
        <div className="shadowing-history-actions">
          <button type="button" className="text-link" onClick={() => { const existing = lines.indexOf(entry.target); if (existing >= 0) setIndex(existing); else { setLines((current) => [entry.target, ...current]); setIndex(0); } setTranscript(""); transcriptRef.current = ""; setFeedback("Ready to practise this saved target again."); setHistoryNotice("Target loaded into the practice area."); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Practise again ↗</button>
          <button type="button" className="text-link" onClick={() => { if (speakText(entry.target)) { void saveListenHistory(entry.target); } }}>▶ Listen</button>
          <button type="button" className="text-link" aria-pressed={entry.favorite} onClick={() => { void toggleFavorite(entry); }}>{entry.favorite ? "★ Favourited" : "☆ Favourite"}</button>
          <button type="button" className="text-link shadowing-history-delete" onClick={() => { void deleteAttempt(entry.id); }}>Delete</button>
        </div>
      </article>)}</div>
    }
  </section>
  </div>;
}
