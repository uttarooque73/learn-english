"use client";

import { useEffect, useMemo, useState } from "react";
import { getSessions, getVocabulary, saveVocabulary, type PracticeSession } from "@/lib/learning-storage";

type Candidate = { id: string; phrase: string; meaning: string; example: string; source: string };
export function ConversationFlashcardExport() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => { const saved = getSessions().filter((session) => session.summary); setSessions(saved); setSelectedSession(saved[0]?.id ?? ""); }, 0); return () => window.clearTimeout(timer); }, []);
  const candidates = useMemo<Candidate[]>(() => {
    const session = sessions.find((item) => item.id === selectedSession);
    if (!session?.summary) return [];
    const summary = session.summary;
    return [
      ...summary.vocabulary.map((item, index) => ({ id: `v-${index}`, phrase: item.phrase, meaning: item.meaning, example: "", source: "Vocabulary" })),
      ...summary.corrections.map((item, index) => ({ id: `c-${index}`, phrase: item.improved, meaning: item.reason || `Improved version of: ${item.original}`, example: item.improved, source: "Correction" })),
    ].filter((item, index, all) => item.phrase.trim() && all.findIndex((candidate) => candidate.phrase.toLowerCase() === item.phrase.toLowerCase()) === index);
  }, [sessions, selectedSession]);
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  function importSelected() {
    const picked = candidates.filter((item) => selected.includes(item.id));
    if (!picked.length) return;
    const before = getVocabulary().length;
    for (const item of picked) saveVocabulary({ phrase: item.phrase, meaning: item.meaning, example: item.example || `Try using “${item.phrase}” in a new sentence.`, category: item.phrase.trim().includes(" ") ? "expression" : "word" });
    const after = getVocabulary().length;
    setMessage(`Imported ${after - before} new flashcard${after - before === 1 ? "" : "s"}; ${picked.length - (after - before)} already existed.`);
    setSelected([]);
  }
  return <section className="learning-feature-panel conversation-export-panel">
    <div className="learning-feature-heading"><div><p className="eyebrow">REUSE WHAT YOU LEARNED</p><h2>Convert a session to flashcards</h2><p>Select vocabulary and corrected phrases from a saved session summary and add them to your spaced-repetition notebook in one batch.</p></div><span className="feature-symbol" aria-hidden="true">▤</span></div>
    {!sessions.length ? <div className="feature-empty"><strong>No saved session summaries yet</strong><p>Complete a practice session and generate its summary first. It will appear here for batch import.</p></div> : <>
      <label className="feature-field">Session summary<select value={selectedSession} onChange={(event) => { setSelectedSession(event.target.value); setSelected([]); setMessage(""); }}>{sessions.map((session) => <option key={session.id} value={session.id}>{session.scenario} — {new Date(session.startedAt).toLocaleDateString()}</option>)}</select></label>
      <div className="flashcard-candidate-list">{candidates.map((item) => <label className="flashcard-candidate" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /><span><strong>{item.phrase}</strong><small>{item.source}</small><span>{item.meaning}</span>{item.example && <em>{item.example}</em>}</span></label>)}</div>
      {candidates.length === 0 && <p className="feature-note">This summary has no vocabulary or corrections to import.</p>}
      <div className="flashcard-export-actions"><button className="button button-primary" type="button" disabled={!selected.length} onClick={importSelected}>Convert selected to flashcards ({selected.length})</button><button className="text-link" type="button" onClick={() => setSelected(candidates.map((item) => item.id))}>Select all</button></div>
      {message && <p className="feature-feedback" role="status">{message} <a href="/vocabulary">Open vocabulary notebook →</a></p>}
    </>}
  </section>;
}
