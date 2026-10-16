"use client";

import { useEffect, useMemo, useState } from "react";
import { getVocabulary, removeVocabulary, updateVocabularyStatus, type SavedVocabulary, type VocabularyStatus } from "@/lib/learning-storage";

const statusLabels: Record<VocabularyStatus, string> = { learning: "Learning", familiar: "Familiar", mastered: "Mastered" };

export function VocabularyNotebook() {
  const [words, setWords] = useState<SavedVocabulary[]>([]);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | VocabularyStatus>("all");
  const [mode, setMode] = useState<"list" | "flashcards" | "quiz">("list");
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [quizChoice, setQuizChoice] = useState("");
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setWords(getVocabulary()); setReady(true); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => words.filter((word) => {
    const matchesSearch = `${word.phrase} ${word.meaning} ${word.example}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    return matchesSearch && (filter === "all" || (word.status ?? "learning") === filter);
  }), [words, search, filter]);

  function refresh() { setWords(getVocabulary()); }
  function changeStatus(word: SavedVocabulary, status: VocabularyStatus) {
    updateVocabularyStatus(word.id, status);
    refresh();
  }
  function deleteWord(word: SavedVocabulary) {
    removeVocabulary(word.id);
    refresh();
    setCardIndex((index) => Math.max(0, Math.min(index, filtered.length - 2)));
  }

  const current = filtered.length ? filtered[cardIndex % filtered.length] : undefined;
  const quizWord = filtered.length ? filtered[quizIndex % filtered.length] : undefined;
  const quizOptions = useMemo(() => {
    if (!quizWord) return [];
    const distractors = words.filter((word) => word.id !== quizWord.id).sort((a, b) => a.phrase.localeCompare(b.phrase)).slice(0, 3);
    return [quizWord, ...distractors].sort((a, b) => a.id.localeCompare(b.id));
  }, [quizWord, words]);

  if (!ready) return <div className="notebook-empty" aria-live="polite">Loading your vocabulary…</div>;

  return (
    <div className="vocabulary-notebook">
      <div className="notebook-toolbar">
        <label className="notebook-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setCardIndex(0); }} placeholder="Search words, meanings, examples" aria-label="Search vocabulary" /></label>
        <label className="notebook-filter"><span className="sr-only">Filter vocabulary status</span><select value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); setCardIndex(0); }}><option value="all">All statuses</option><option value="learning">Learning</option><option value="familiar">Familiar</option><option value="mastered">Mastered</option></select></label>
      </div>
      <div className="vocabulary-summary" aria-label="Vocabulary totals">
        {(["learning", "familiar", "mastered"] as VocabularyStatus[]).map((status) => <button type="button" className={filter === status ? "vocab-summary-item active" : "vocab-summary-item"} key={status} onClick={() => { setFilter(filter === status ? "all" : status); setCardIndex(0); }}><strong>{words.filter((word) => (word.status ?? "learning") === status).length}</strong><span>{statusLabels[status]}</span></button>)}
      </div>
      <div className="notebook-mode-tabs" role="group" aria-label="Vocabulary practice mode">
        <button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>Word bank</button>
        <button type="button" className={mode === "flashcards" ? "active" : ""} onClick={() => { setMode("flashcards"); setRevealed(false); }}>Flashcards</button>
        <button type="button" className={mode === "quiz" ? "active" : ""} onClick={() => { setMode("quiz"); setQuizChoice(""); setQuizAnswered(false); }}>Quick quiz</button>
      </div>

      {mode === "flashcards" ? (
        <section className="vocab-study-card" aria-label="Vocabulary flashcard">
          {current ? <><p className="eyebrow">FLASHCARD {cardIndex + 1} OF {filtered.length}</p><h3>{current.phrase}</h3>{revealed ? <><p>{current.meaning}</p><blockquote>{current.example}</blockquote><span className={`vocab-status status-${current.status ?? "learning"}`}>{statusLabels[current.status ?? "learning"]}</span></> : <p className="vocab-study-hint">Try to remember the meaning, then reveal the answer.</p>}<div className="vocab-study-actions">{!revealed ? <button type="button" className="button button-dark" onClick={() => setRevealed(true)}>Reveal meaning</button> : <><button type="button" className="button button-light" onClick={() => changeStatus(current, "learning")}>Still learning</button><button type="button" className="button button-dark" onClick={() => changeStatus(current, "mastered")}>I know this</button></>}<button type="button" className="notebook-secondary" onClick={() => { setCardIndex((index) => (index + 1) % filtered.length); setRevealed(false); }}>Next card →</button></div></> : <div className="notebook-empty"><h3>No cards to review</h3><p>Save a useful phrase from Practice Room to start studying.</p></div>}
        </section>
      ) : mode === "quiz" ? (
        <section className="vocab-study-card" aria-label="Vocabulary meaning quiz">
          {quizWord && quizOptions.length > 1 ? <><p className="eyebrow">QUICK QUIZ · {quizIndex + 1}</p><h3>What does “{quizWord.phrase}” mean?</h3><div className="vocab-quiz-options">{quizOptions.map((option) => <button type="button" key={option.id} className={quizChoice === option.id ? "selected" : ""} disabled={quizAnswered} onClick={() => setQuizChoice(option.id)}>{option.meaning}</button>)}</div>{quizAnswered && <p className={quizChoice === quizWord.id ? "quiz-result correct" : "quiz-result"} role="status">{quizChoice === quizWord.id ? "Correct — nice work!" : `Not quite. The meaning is: ${quizWord.meaning}`}</p>}<div className="vocab-study-actions">{!quizAnswered ? <button type="button" className="button button-dark" disabled={!quizChoice} onClick={() => setQuizAnswered(true)}>Check answer</button> : <button type="button" className="button button-dark" onClick={() => { setQuizIndex((index) => (index + 1) % filtered.length); setQuizChoice(""); setQuizAnswered(false); }}>Next question →</button>}</div></> : <div className="notebook-empty"><h3>Add at least two vocabulary items</h3><p>The quiz needs two or more saved words with meanings. Save phrases from Practice Room.</p></div>}
        </section>
      ) : filtered.length ? (
        <div className="saved-word-grid">{filtered.map((word) => <article className="saved-word-card" key={word.id}><div className="saved-word-heading"><div><h3>{word.phrase}</h3><span className={`vocab-status status-${word.status ?? "learning"}`}>{statusLabels[word.status ?? "learning"]}</span></div><button type="button" className="notebook-delete" onClick={() => deleteWord(word)} aria-label={`Delete ${word.phrase}`}>×</button></div><p>{word.meaning}</p><blockquote>{word.example}</blockquote><div className="saved-word-footer"><label>Learning status <select aria-label={`Status for ${word.phrase}`} value={word.status ?? "learning"} onChange={(event) => changeStatus(word, event.target.value as VocabularyStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><small>{new Date(word.savedAt).toLocaleDateString()}</small></div></article>)}</div>
      ) : <div className="notebook-empty"><h3>{words.length ? "No matching words" : "Your word bank is ready"}</h3><p>{words.length ? "Try another search or status filter." : "Practice a conversation, ask for feedback, and save phrases to build your personal vocabulary notebook."}</p></div>}
      <p className="storage-note">Your vocabulary stays in this browser. Status changes and deletions are saved automatically.</p>
    </div>
  );
}
