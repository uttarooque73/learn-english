"use client";

import { useEffect } from "react";

/**
 * Adds dictation controls to learner response fields across the app.
 * Uses the browser Web Speech API when available and inserts dictated text at
 * the current cursor position instead of replacing the learner's answer.
 */
export function VoiceFieldEnhancer() {
  useEffect(() => {
    type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
    type Recognition = {
      lang: string;
      interimResults: boolean;
      onresult: ((event: RecognitionResult) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    type RecognitionConstructor = new () => Recognition;
    const browser = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const RecognitionAPI = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    const selector = 'textarea:not([readonly]):not([disabled]), input[type="text"]:not([readonly]):not([disabled]), input:not([type]):not([readonly]):not([disabled])';
    const controls = new WeakMap<Element, HTMLButtonElement>();
    const listenControls = new WeakMap<Element, HTMLButtonElement>();
    let activeRecognition: Recognition | null = null;
    let activeButton: HTMLButtonElement | null = null;

    const addControl = (field: Element) => {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
      if (field.closest('[data-voice-controls="ignore"]') || controls.has(field)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "inline-dictation-control";
      button.textContent = "🎙 Dictate";
      button.setAttribute("aria-label", "Write answer using voice");
      button.title = RecognitionAPI ? "Dictate your answer" : "Voice dictation is not supported in this browser";
      button.disabled = !RecognitionAPI;
      button.addEventListener("click", () => {
        if (!RecognitionAPI) return;
        if (activeRecognition && activeButton === button) {
          activeRecognition.stop();
          button.textContent = "🎙 Dictate";
          return;
        }
        activeRecognition?.stop();
        const recognition = new RecognitionAPI();
        activeRecognition = recognition;
        activeButton = button;
        recognition.lang = document.documentElement.lang || "en-US";
        recognition.interimResults = false;
        button.textContent = "■ Stop dictation";
        recognition.onresult = (event) => {
          const transcript = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
          if (!transcript) return;
          const input = field as HTMLInputElement | HTMLTextAreaElement;
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? input.value.length;
          const before = input.value.slice(0, start);
          const after = input.value.slice(end);
          const separator = before && !/\s$/.test(before) ? " " : "";
          const insertion = separator + transcript;
          const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
          setter?.call(input, before + insertion + after);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          const cursor = before.length + insertion.length;
          input.setSelectionRange(cursor, cursor);
          input.focus();
        };
        const reset = () => {
          if (activeRecognition === recognition) activeRecognition = null;
          if (activeButton === button) activeButton = null;
          button.textContent = "🎙 Dictate";
        };
        recognition.onerror = reset;
        recognition.onend = reset;
        try { recognition.start(); } catch { reset(); }
      });
      const parent = field.parentElement;
      if (parent) {
        // Keep injected controls outside label elements so they do not change
        // the field's accessible name (for example, "Paragraph Listen Dictate").
        const controlHost = parent.tagName === "LABEL" && parent.parentElement ? parent.parentElement : parent;
        const insertionAnchor = controlHost === parent ? field : parent;
        controlHost.insertBefore(button, insertionAnchor.nextSibling);
        controls.set(field, button);
        const listen = document.createElement("button");
        listen.type = "button";
        listen.className = "inline-listen-control";
        listen.textContent = "🔊 Listen";
        listen.setAttribute("aria-label", "Listen to the question or prompt");
        listen.title = "Read the associated question or prompt aloud";
        listen.addEventListener("click", () => {
          const input = field as HTMLInputElement | HTMLTextAreaElement;
          const label = input.labels ? Array.from(input.labels).map((item) => item.innerText).join(" ") : "";
          const describedBy = input.getAttribute("aria-describedby");
          const description = describedBy ? describedBy.split(/\\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" ") : "";
          const prompt = [label, input.getAttribute("aria-label"), description, input.placeholder].filter(Boolean).join(". ").trim();
          if (!prompt || !("speechSynthesis" in window)) return;
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(prompt);
          utterance.lang = document.documentElement.lang || "en-US";
          window.speechSynthesis.speak(utterance);
        });
        controlHost.insertBefore(listen, button.nextSibling);
        listenControls.set(field, listen);
      }
    };

    const scan = () => document.querySelectorAll(selector).forEach(addControl);
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      activeRecognition?.stop();
      document.querySelectorAll(".inline-dictation-control, .inline-listen-control").forEach((button) => button.remove());
    };
  }, []);

  return null;
}
