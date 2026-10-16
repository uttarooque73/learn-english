"use client";

import { useEffect, useState } from "react";

function startSpeaking(text: string, onStop: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === "en-us")
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en-"))
    ?? null;
  utterance.lang = utterance.voice?.lang ?? "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1.05;
  utterance.onend = onStop;
  utterance.onerror = onStop;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function ListenButton({ text, label = "Listen", className = "notebook-secondary" }: { text: string; label?: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => { setSupported("speechSynthesis" in window); }, []);

  if (!supported) return null;
  return <button type="button" className={className} onClick={() => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    } else {
      setSpeaking(startSpeaking(text, () => setSpeaking(false)));
    }
  }} disabled={!text.trim()} aria-label={speaking ? "Stop audio" : label} title={speaking ? "Stop audio" : label}>
    {speaking ? "■ Stop" : "▶ Listen"}
  </button>;
}

export function ListenPageControl() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => { setSupported("speechSynthesis" in window); }, []);

  if (!supported) return null;
  return <button type="button" className="listen-page-control" onClick={() => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const content = document.querySelector<HTMLElement>(".page-content");
    if (!content) return;
    const copy = content.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("button, input, textarea, select, footer, .listen-page-control, .page-heading").forEach((node) => node.remove());
    const text = copy.innerText.replace(/\s+/g, " ").trim();
    if (text) setSpeaking(startSpeaking(text, () => setSpeaking(false)));
  }} aria-pressed={speaking} aria-label={speaking ? "Stop reading page" : "Listen to page"}>
    <span aria-hidden="true">{speaking ? "■" : "🔊"}</span> {speaking ? "Stop listening" : "Listen to page"}
  </button>;
}
