"use client";

import { useState } from "react";
import { speakText, stopSpeaking } from "@/lib/speech-playback";


export function ListenButton({ text, label = "Listen", className = "notebook-secondary" }: { text: string; label?: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);

  return <button type="button" className={className} onClick={() => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(speakText(text, () => setSpeaking(false)));
    }
  }} disabled={!text.trim()} aria-label={speaking ? "Stop audio" : label} title={speaking ? "Stop audio" : label}>
    {speaking ? "■ Stop" : "▶ Listen"}
  </button>;
}

export function ListenPageControl() {
  const [speaking, setSpeaking] = useState(false);

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
    if (text) setSpeaking(speakText(text, () => setSpeaking(false)));
  }} aria-pressed={speaking} aria-label={speaking ? "Stop reading page" : "Listen to page"}>
    <span aria-hidden="true">{speaking ? "■" : "🔊"}</span> {speaking ? "Stop listening" : "Listen to page"}
  </button>;
}
