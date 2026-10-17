"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getVocabulary, saveVocabulary } from "@/lib/learning-storage";
import { initializeDatabasePersistence } from "@/lib/client-persistence";

type SelectionAnchor = { phrase: string; top: number; left: number };

function normalizeSelection(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function VocabularySelectionTool() {
  const [selection, setSelection] = useState<SelectionAnchor | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [meaning, setMeaning] = useState("");
  const [example, setExample] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    document.documentElement.dataset.vocabularySelectionReady = "true";
    function captureSelection(event: Event) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-vocabulary-selection-tool], input, textarea, select, button, [contenteditable='true']")) return;
      const currentSelection = window.getSelection();
      const phrase = normalizeSelection(currentSelection?.toString() ?? "");
      if (phrase.length < 2 || phrase.length > 120 || !/[\p{L}\p{N}]/u.test(phrase) || !currentSelection?.rangeCount) {
        setSelection(null);
        setFormOpen(false);
        return;
      }
      const rect = currentSelection.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      const panelWidth = Math.min(320, window.innerWidth - 24);
      setSelection({
        phrase,
        top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 58)),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12)),
      });
      setFormOpen(false);
      setMeaning("");
      setExample("");
      setStatus("");
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setSelection(null); setFormOpen(false); }
    }
    window.addEventListener("mouseup", captureSelection);
    window.addEventListener("keyup", captureSelection);
    document.addEventListener("selectionchange", captureSelection);
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      delete document.documentElement.dataset.vocabularySelectionReady;
      window.removeEventListener("mouseup", captureSelection);
      window.removeEventListener("keyup", captureSelection);
      document.removeEventListener("selectionchange", captureSelection);
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, []);

  async function saveSelectedText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    try { await initializeDatabasePersistence(); } catch { setStatus("Could not load your vocabulary from the database. Please retry."); return; }
    const existing = getVocabulary().find((item) => item.phrase.trim().toLocaleLowerCase() === selection.phrase.toLocaleLowerCase());
    if (existing) {
      setStatus("“" + selection.phrase + "” is already in your vocabulary.");
    } else {
      let finalMeaning = meaning.trim();
      let finalExample = example.trim();
      let category: "word" | "expression" | "collocation" | "phrasal verb" = /\s/.test(selection.phrase) ? "expression" : "word";
      if (!finalMeaning || !finalExample) {
        setStatus("Generating an AI meaning for “" + selection.phrase + "”…");
        try {
          const response = await fetch("/api/vocabulary/define", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phrase: selection.phrase }),
          });
          const definition = await response.json() as { meaning?: string; example?: string; category?: typeof category; error?: string };
          if (!response.ok || !definition.meaning) throw new Error(definition.error || "AI definition failed.");
          finalMeaning ||= definition.meaning;
          finalExample ||= definition.example || "";
          category = definition.category || category;
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not generate a meaning. Please try again.");
          return;
        }
      }
      saveVocabulary({ phrase: selection.phrase, meaning: finalMeaning, example: finalExample, category });
      setStatus("Saved “" + selection.phrase + "” to your vocabulary with its meaning.");
    }
    setSelection(null);
    setFormOpen(false);
    window.getSelection()?.removeAllRanges();
  }

  return (
    <>
      {selection && !formOpen && (
        <div className="vocabulary-selection-action" data-vocabulary-selection-tool style={{ top: selection.top, left: selection.left }}>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setFormOpen(true)} aria-label="Save selected text to vocabulary">
            <span aria-hidden="true">＋</span> Save vocabulary
          </button>
          <button type="button" className="vocabulary-selection-practice" onMouseDown={(event) => event.preventDefault()} onClick={() => { const phrase = selection.phrase; setSelection(null); setFormOpen(false); window.getSelection()?.removeAllRanges(); window.location.assign(`/shadowing?text=${encodeURIComponent(phrase)}`); }} aria-label={`Practice ${selection.phrase}`}>🎙 Practice</button>
          <button type="button" className="vocabulary-selection-dismiss" onMouseDown={(event) => event.preventDefault()} onClick={() => setSelection(null)} aria-label="Dismiss vocabulary action">×</button>
        </div>
      )}
      {selection && formOpen && (
        <form className="vocabulary-selection-panel" data-vocabulary-selection-tool onSubmit={saveSelectedText} style={{ top: selection.top, left: selection.left }} aria-label="Add selected text to vocabulary">
          <div className="vocabulary-selection-heading">
            <div><span className="eyebrow">SAVE FOR LATER</span><strong>{selection.phrase}</strong></div>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelection(null); setFormOpen(false); }} aria-label="Close vocabulary form">×</button>
          </div>
          <label>Meaning <span>(optional)</span><input aria-label="Meaning (optional)" value={meaning} onChange={(event) => setMeaning(event.target.value)} placeholder="What does it mean?" /></label>
          <label>Example <span>(optional)</span><textarea aria-label="Example (optional)" value={example} onChange={(event) => setExample(event.target.value)} placeholder="Use it in a sentence" rows={2} /></label>
          <div className="vocabulary-selection-actions">
            <button type="button" className="vocabulary-selection-cancel" onClick={() => { setSelection(null); setFormOpen(false); }}>Cancel</button>
            <button type="submit">Save to vocabulary</button>
          </div>
        </form>
      )}
      {status && <p className="vocabulary-selection-status" role="status" aria-live="polite">{status}<button type="button" onClick={() => setStatus("")} aria-label="Dismiss save confirmation">×</button></p>}
    </>
  );
}
