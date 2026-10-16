"use client";

import { useEffect, useState } from "react";

const DEFAULT_LINES = [
  "Could you give me a moment to think about that?",
  "I will follow up with the team and share an update.",
  "I understand your point, and I would like to add one thing.",
  "Would you mind explaining that in a little more detail?",
  "The main challenge is finding a solution that works for everyone.",
];

type Recognition = { lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

function compareWords(expected: string, actual: string) {
  const clean = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9']/g, "").trim();
  const target = expected.split(/\s+/).map(clean).filter(Boolean);
  const heard = actual.split(/\s+/).map(clean).filter(Boolean);
  const matched = target.filter((word, index) => heard[index] === word).length;
  return { target, heard, matched, percent: target.length ? Math.round(matched / target.length * 100) : 0 };
}

export function ShadowingPractice() {
  const [lines, setLines] = useState(DEFAULT_LINES);
  const [customLine, setCustomLine] = useState("");
  const [index, setIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState("");
  const [listening, setListening] = useState(false);
  const [rate, setRate] = useState(0.85);
  const supported = typeof window !== "undefined" && (() => { const w = window as SpeechWindow; return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition); })();

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const sentence = lines[index] ?? lines[0];
  function speakSentence() {
    if (!("speechSynthesis" in window) || !sentence) {
      setFeedback("Text-to-speech is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = "en-US";
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  }
  function startRepeat() {
    const w = window as SpeechWindow;
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) {
      setFeedback("Speech recognition is not available here. You can still practise by repeating aloud.");
      return;
    }
    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript ?? "";
      setTranscript(spoken);
      const result = compareWords(sentence, spoken);
      setFeedback(`Word match: ${result.percent}%. ${result.percent >= 85 ? "Great clarity — try matching the rhythm next." : "Listen once more, then focus on the highlighted words."}`);
      setListening(false);
    };
    recognition.onerror = () => { setFeedback("I could not capture that attempt. Check microphone permission and try again."); setListening(false); };
    recognition.onend = () => setListening(false);
    try { recognition.start(); setListening(true); setFeedback("Listening… repeat the sentence naturally."); } catch { setListening(false); setFeedback("Could not start the microphone. Try again."); }
  }
  const comparison = transcript ? compareWords(sentence, transcript) : null;

  return <section className="learning-feature-panel shadowing-panel" aria-labelledby="shadowing-heading">
    <div className="learning-feature-heading"><div><p className="eyebrow">PRONUNCIATION DRILL</p><h2 id="shadowing-heading">Shadowing practice</h2><p>Listen to one line, repeat it aloud, and compare the words captured by speech recognition.</p></div><span className="feature-symbol" aria-hidden="true">◖♪</span></div>
    <label className="feature-field">Practice sentence<select value={index} onChange={(event) => { setIndex(Number(event.target.value)); setTranscript(""); setFeedback(""); }}><option value={0} disabled={false}>Choose a sentence…</option>{lines.map((line, i) => <option key={line} value={i}>{line}</option>)}</select></label>
    <blockquote className="shadowing-sentence">{sentence}</blockquote>
    <div className="shadowing-controls"><label>Speaking speed <select value={rate} onChange={(event) => setRate(Number(event.target.value))}><option value={0.7}>Slow</option><option value={0.85}>Steady</option><option value={1}>Natural</option></select></label><button type="button" className="button button-outline" onClick={speakSentence}>▶ Listen</button><button type="button" className="button button-primary" onClick={startRepeat} disabled={listening}>{listening ? "Listening…" : "🎙 Repeat aloud"}</button><button type="button" className="text-link" onClick={() => { setIndex((index + 1) % lines.length); setTranscript(""); setFeedback(""); }}>Next line →</button></div>
    {transcript && comparison && <div className="shadowing-result"><strong>Your attempt</strong><p>{transcript}</p><div className="word-feedback" aria-label={`Word match ${comparison.percent} percent`}>{comparison.target.map((word, i) => <span className={comparison.heard[i] === word ? "word-match" : "word-miss"} key={i}>{word}</span>)}</div><p>{feedback}</p><small>Word matching is a rough practice aid, not a phonetic or accent score. Cadence and intonation are not measured by browser recognition.</small></div>}
    {!transcript && feedback && <p className="feature-feedback" role="status">{feedback}</p>}
    {!supported && <p className="feature-note">This browser does not expose speech recognition. Listen and repeat still works where browser text-to-speech is available.</p>}
    <form className="shadowing-custom-line" onSubmit={(event) => { event.preventDefault(); const line = customLine.trim(); if (!line || line.length > 240) return; setLines((current) => [...current, line]); setIndex(lines.length); setCustomLine(""); setTranscript(""); setFeedback(""); }}><label className="feature-field">Practise your own sentence<input value={customLine} maxLength={240} onChange={(event) => setCustomLine(event.target.value)} placeholder="Type a sentence to practise" /></label><button type="submit" className="button button-outline" disabled={!customLine.trim()}>Add sentence</button></form>
  </section>;
}
