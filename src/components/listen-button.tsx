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

/** Page-wide reading control. The root layout mounts this on every route. */
export function ListenPageControl() {
  const [speaking, setSpeaking] = useState(false);

  return <button type="button" className="listen-page-control" onClick={() => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const content = document.querySelector<HTMLElement>(".page-content, main, [role='main']");
    if (!content) return;
    const copy = content.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("button, input, textarea, select, nav, footer, .listen-page-control, .global-learning-controls, .page-heading, .floating-english-panel, .floating-english-trigger").forEach((node) => node.remove());
    const text = copy.innerText.replace(/\\s+/g, " ").trim();
    if (text) setSpeaking(speakText(text, () => setSpeaking(false)));
  }} aria-pressed={speaking} aria-label={speaking ? "Stop reading page" : "Listen to page"} title={speaking ? "Stop reading page" : "Read page content aloud"}>
    <span aria-hidden="true">{speaking ? "■" : "🔊"}</span> {speaking ? "Stop listening" : "Listen to page"}
  </button>;
}

/** Always-visible voice entry point; the global Jarvis assistant handles microphone input. */
export function GlobalVoiceControl() {
  return <button type="button" className="global-voice-control" onClick={() => window.dispatchEvent(new Event("speakup:open-voice-coach"))} aria-label="Open voice practice" title="Open voice practice">
    <span aria-hidden="true">🎙</span> Voice practice
  </button>;
}

export function GlobalLearningControls() {
  return <div className="global-learning-controls" role="group" aria-label="Page listening and voice controls">
    <ListenPageControl />
    <GlobalVoiceControl />
  </div>;
}
