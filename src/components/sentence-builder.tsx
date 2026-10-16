"use client";

import { useState, type FormEvent } from "react";

export function SentenceBuilder() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function suggest(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || loading) return;
    setLoading(true); setError(""); setAlternatives([]);
    try {
      const response = await fetch("/api/sentence-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const payload = await response.json() as { alternatives?: string[]; error?: string };
      if (!response.ok || !Array.isArray(payload.alternatives)) throw new Error(payload.error || "Could not generate suggestions.");
      setAlternatives(payload.alternatives.filter((item) => typeof item === "string").slice(0, 3));
      if (!payload.alternatives.length) throw new Error("No suggestions returned. Please try again.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate suggestions."); }
    finally { setLoading(false); }
  }

  function applySuggestion(sentence: string) {
    const input = document.querySelector<HTMLTextAreaElement>(".chat-composer textarea, .practice-chat-input textarea, textarea[name='message']");
    if (!input) { setError("Suggestion selected. Copy it into the conversation input to use it."); return; }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(input, sentence);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setError("Added to the conversation input. Review it before sending.");
  }

  return <section className="learning-feature-panel sentence-builder-panel">
    <div className="learning-feature-heading"><div><p className="eyebrow">NEED A STARTING POINT?</p><h2>Help me phrase this</h2><p>Write a rough thought in English or your own language. AI will suggest three natural English versions.</p></div><button type="button" className="button button-outline" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Hide helper" : "Open helper"}</button></div>
    {open && <form onSubmit={suggest} className="sentence-builder-form"><label className="feature-field">What do you want to say?<textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} rows={3} placeholder="e.g. I not come office because health not good" required /></label><button className="button button-primary" type="submit" disabled={loading || !draft.trim()}>{loading ? "Thinking…" : "Suggest 3 natural sentences"}</button>
      {error && <p className="feature-feedback" role="status">{error}</p>}
      {alternatives.length > 0 && <ol className="sentence-alternatives">{alternatives.map((sentence) => <li key={sentence}><p>{sentence}</p><button type="button" className="button button-outline" onClick={() => applySuggestion(sentence)}>Use this sentence</button></li>)}</ol>}
    </form>}
  </section>;
}
