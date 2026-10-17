"use client";

import Link from "next/link";
import { ListenButton } from "@/components/listen-button";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getDueVocabulary, getVocabulary, removeVocabulary, reviewVocabulary, saveVocabulary, updateVocabularyStatus, type SavedVocabulary, type VocabularyStatus } from "@/lib/learning-storage";
import { initializeDatabasePersistence } from "@/lib/client-persistence";

const statusLabels: Record<VocabularyStatus, string> = { learning: "Learning", familiar: "Familiar", mastered: "Mastered" };

const usefulExpressions: { phrase: string; meaning: string; example: string; category: NonNullable<SavedVocabulary["category"]> }[] = [
  { phrase: "make a decision", meaning: "Choose what to do after thinking about the options.", example: "We need to make a decision before Friday.", category: "collocation" },
  { phrase: "take responsibility", meaning: "Accept that something is your duty or your mistake.", example: "I will take responsibility for fixing the issue.", category: "collocation" },
  { phrase: "meet a deadline", meaning: "Finish work by the required time.", example: "We worked together to meet the deadline.", category: "collocation" },
  { phrase: "raise a concern", meaning: "Tell others about a possible problem.", example: "I would like to raise a concern about the timeline.", category: "collocation" },
  { phrase: "pay attention", meaning: "Listen or look carefully.", example: "Please pay attention to the final instructions.", category: "collocation" },
  { phrase: "keep in touch", meaning: "Continue communicating with someone.", example: "Let's keep in touch after the project ends.", category: "expression" },
  { phrase: "on the same page", meaning: "Sharing the same understanding or plan.", example: "Let's confirm that we are on the same page.", category: "expression" },
  { phrase: "a piece of cake", meaning: "Something very easy to do.", example: "The first exercise was a piece of cake.", category: "expression" },
  { phrase: "under the weather", meaning: "Feeling slightly ill.", example: "I'm feeling under the weather today.", category: "expression" },
  { phrase: "once in a while", meaning: "Sometimes, but not often.", example: "I eat out once in a while.", category: "expression" },
  { phrase: "figure out", meaning: "Understand or solve something.", example: "We will figure out why the test failed.", category: "phrasal verb" },
  { phrase: "follow up", meaning: "Take another action to check progress or continue a conversation.", example: "I'll follow up with the team tomorrow.", category: "phrasal verb" },
  { phrase: "bring up", meaning: "Start talking about a subject.", example: "She brought up an important point in the meeting.", category: "phrasal verb" },
  { phrase: "carry on", meaning: "Continue doing something.", example: "Please carry on with your presentation.", category: "phrasal verb" },
  { phrase: "look into", meaning: "Investigate or try to find out more about something.", example: "I'll look into the login problem.", category: "phrasal verb" },
  { phrase: "work out", meaning: "Find a solution or reach an agreement.", example: "We can work out a better schedule.", category: "phrasal verb" },
  { phrase: "run out of time", meaning: "Have no time remaining.", example: "We ran out of time before the final question.", category: "expression" },
  { phrase: "in advance", meaning: "Before a particular time or event.", example: "Please let me know in advance if you cannot attend.", category: "expression" },
  { phrase: "come up with", meaning: "Think of an idea, answer, or plan.", example: "Can you come up with another solution?", category: "phrasal verb" },
  { phrase: "make progress", meaning: "Move closer to completing or improving something.", example: "Practising a little every day helps you make progress.", category: "collocation" },
];

export function VocabularyNotebook() {
  const [words, setWords] = useState<SavedVocabulary[]>([]);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [displayStyle, setDisplayStyle] = useState<"list" | "cards">("list");
  const [filter, setFilter] = useState<"all" | VocabularyStatus>("all");
  const [mode, setMode] = useState<"list" | "flashcards" | "quiz" | "review" | "expressions">("list");
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [quizChoice, setQuizChoice] = useState("");
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [newPhrase, setNewPhrase] = useState("");
  const [newMeaning, setNewMeaning] = useState("");
  const [newExample, setNewExample] = useState("");
  const [defining, setDefining] = useState(false);
  const [savingNewWord, setSavingNewWord] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  async function generateDefinition(phrase: string) {
    const response = await fetch("/api/vocabulary/define", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase }),
    });
    const result = await response.json() as { meaning?: string; example?: string; category?: SavedVocabulary["category"]; error?: string };
    if (!response.ok || !result.meaning) throw new Error(result.error || "Could not generate a definition.");
    return result;
  }

  async function addWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phrase = newPhrase.trim();
    if (!phrase || phrase.length > 120) {
      setAddError("Enter a word or phrase up to 120 characters.");
      return;
    }
    setAddError("");
    setAddSuccess("");
    const existing = getVocabulary().find((item) => item.phrase.trim().toLocaleLowerCase() === phrase.toLocaleLowerCase());
    if (existing) {
      setAddError("“" + phrase + "” is already in your word bank.");
      return;
    }
    setSavingNewWord(true);
    try {
      let meaning = newMeaning.trim();
      let example = newExample.trim();
      let category: SavedVocabulary["category"] = /\s/.test(phrase) ? "expression" : "word";
      if (!meaning || !example) {
        setDefining(true);
        const definition = await generateDefinition(phrase);
        meaning ||= definition.meaning || "";
        example ||= definition.example || "";
        category = definition.category || category;
        setNewMeaning(meaning);
        setNewExample(example);
      }
      const saved = saveVocabulary({ phrase, meaning, example, category });
      refresh();
      setNewPhrase("");
      setNewMeaning("");
      setNewExample("");
      setAddSuccess("Saved “" + saved.phrase + "” with its definition.");
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Could not add this vocabulary item.");
    } finally {
      setDefining(false);
      setSavingNewWord(false);
    }
  }

  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (!active) return;
      setWords(getVocabulary());
      if (new URLSearchParams(window.location.search).get("mode") === "review") setMode("review");
      setReady(true);
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => words.filter((word) => {
    const matchesSearch = `${word.phrase} ${word.meaning} ${word.example}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    return matchesSearch && (filter === "all" || (word.status ?? "learning") === filter);
  }), [words, search, filter]);

  function refresh() { setWords(getVocabulary()); }
  function saveExpression(expression: (typeof usefulExpressions)[number]) {
    saveVocabulary(expression);
    refresh();
  }
  function changeStatus(word: SavedVocabulary, status: VocabularyStatus) {
    updateVocabularyStatus(word.id, status);
    refresh();
  }
  function deleteWord(word: SavedVocabulary) {
    removeVocabulary(word.id);
    refresh();
    setCardIndex((index) => Math.max(0, Math.min(index, filtered.length - 2)));
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleWords = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const dueWords = useMemo(() => getDueVocabulary().filter((word) => words.some((saved) => saved.id === word.id)), [words]);
  const currentDue = dueWords.length ? dueWords[reviewIndex % dueWords.length] : undefined;
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
      <form className="vocabulary-add-form" onSubmit={addWord} aria-label="Add vocabulary manually">
        <div className="vocabulary-add-heading">
          <div><p className="eyebrow">ADD YOUR OWN WORDS</p><h3>Save vocabulary by typing</h3><p>Enter a word or phrase. AI will generate a clear meaning and example automatically.</p></div>
        </div>
        <label>Word or phrase
          <input value={newPhrase} onChange={(event) => setNewPhrase(event.target.value)} maxLength={120} required placeholder="e.g. meticulous, break the ice" aria-label="Word or phrase to save" />
        </label>
        <div className="vocabulary-add-fields">
          <label>Meaning <span>(AI-generated; editable)</span>
            <textarea value={newMeaning} onChange={(event) => setNewMeaning(event.target.value)} rows={2} placeholder="Generated automatically when you save" aria-label="Vocabulary meaning" />
          </label>
          <label>Example sentence <span>(AI-generated; editable)</span>
            <textarea value={newExample} onChange={(event) => setNewExample(event.target.value)} rows={2} placeholder="A natural example will be generated" aria-label="Vocabulary example sentence" />
          </label>
        </div>
        {addError && <p className="vocabulary-add-message error" role="alert">{addError}</p>}
        {addSuccess && <p className="vocabulary-add-message success" role="status">{addSuccess}</p>}
        <div className="vocabulary-add-actions">
          <button type="button" className="notebook-secondary" disabled={!newPhrase.trim() || defining || savingNewWord} onClick={async () => {
            setAddError(""); setAddSuccess(""); setDefining(true);
            try { const definition = await generateDefinition(newPhrase.trim()); setNewMeaning(definition.meaning || ""); setNewExample(definition.example || ""); }
            catch (error) { setAddError(error instanceof Error ? error.message : "Could not generate a definition."); }
            finally { setDefining(false); }
          }}>{defining ? "Generating with AI…" : "Generate meaning with AI"}</button>
          <button type="submit" className="button button-dark" disabled={savingNewWord || !newPhrase.trim()}>{savingNewWord ? "Saving…" : "Save vocabulary"}</button>
        </div>
      </form>
      <div className="notebook-toolbar">
        <label className="notebook-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setCardIndex(0); setPage(1); }} placeholder="Search words, meanings, examples" aria-label="Search vocabulary" /></label>
        <label className="notebook-filter"><span className="sr-only">Filter vocabulary status</span><select value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); setCardIndex(0); setPage(1); }}><option value="all">All statuses</option><option value="learning">Learning</option><option value="familiar">Familiar</option><option value="mastered">Mastered</option></select></label>
      </div>
      <div className="vocabulary-summary" aria-label="Vocabulary totals">
        {(["learning", "familiar", "mastered"] as VocabularyStatus[]).map((status) => <button type="button" className={filter === status ? "vocab-summary-item active" : "vocab-summary-item"} key={status} onClick={() => { setFilter(filter === status ? "all" : status); setCardIndex(0); setPage(1); }}><strong>{words.filter((word) => (word.status ?? "learning") === status).length}</strong><span>{statusLabels[status]}</span></button>)}
      </div>
      <div className="notebook-mode-tabs" role="group" aria-label="Vocabulary practice mode">
        <button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>Word bank</button>
        <button type="button" className={mode === "flashcards" ? "active" : ""} onClick={() => { setMode("flashcards"); setRevealed(false); }}>Flashcards</button>
        <button type="button" className={mode === "quiz" ? "active" : ""} onClick={() => { setMode("quiz"); setQuizChoice(""); setQuizAnswered(false); }}>Quick quiz</button>
        <button type="button" className={mode === "review" ? "active" : ""} onClick={() => { setMode("review"); setReviewIndex(0); setRevealed(false); }}>Review due <span className="review-due-count">{dueWords.length}</span></button>
        <button type="button" className={mode === "expressions" ? "active" : ""} onClick={() => setMode("expressions")}>Useful expressions</button>
      </div>

      {mode === "expressions" ? (
        <section className="expression-library" aria-label="Collocations, phrasal verbs, and common expressions">
          <div className="expression-library-heading"><p className="eyebrow">SPEAK MORE NATURALLY</p><h3>Useful expressions</h3><p>Learn phrases native speakers use in everyday life and at work. Save any phrase to your word bank to review it later.</p></div>
          <div className="expression-library-grid">{usefulExpressions.map((expression) => {
            const saved = words.some((word) => word.phrase.toLocaleLowerCase() === expression.phrase.toLocaleLowerCase());
            return <article className="expression-card" key={expression.phrase}>
              <div className="expression-card-top"><span className="expression-category">{expression.category}</span>{saved && <span className="expression-saved">Saved</span>}</div>
              <h4>{expression.phrase}</h4><ListenButton text={`${expression.phrase}. ${expression.meaning}. ${expression.example}`} label={`Listen to ${expression.phrase}`} /><p>{expression.meaning}</p><blockquote>{expression.example}</blockquote>
              <button type="button" className="notebook-secondary" disabled={saved} onClick={() => saveExpression(expression)} aria-label={saved ? `${expression.phrase} saved` : `Save expression: ${expression.phrase}`}>{saved ? "Added to word bank" : "Save to word bank"}</button>
            </article>;
          })}</div>
        </section>
      ) : mode === "review" ? (
        <section className="vocab-study-card spaced-review-card" aria-label="Spaced repetition review">
          {currentDue ? <><p className="eyebrow">DUE REVIEW · {reviewIndex + 1} OF {dueWords.length}</p><h3>{currentDue.phrase}</h3><ListenButton text={`${currentDue.phrase}. ${currentDue.meaning}. ${currentDue.example}`} label={`Listen to ${currentDue.phrase}`} />{revealed ? <><p>{currentDue.meaning}</p><blockquote>{currentDue.example}</blockquote><p className="review-history">Reviewed {currentDue.reviewCount ?? 0} time(s). Your answer schedules the next review.</p><div className="vocab-study-actions"><button type="button" className="button button-light" onClick={() => { reviewVocabulary(currentDue.id, "again"); refresh(); setReviewIndex(0); setRevealed(false); }}>Again · 1 day</button><button type="button" className="button button-dark" onClick={() => { reviewVocabulary(currentDue.id, "good"); refresh(); setReviewIndex(0); setRevealed(false); }}>Got it · 3 days</button><button type="button" className="button button-primary" onClick={() => { reviewVocabulary(currentDue.id, "easy"); refresh(); setReviewIndex(0); setRevealed(false); }}>Easy · 7 days</button></div></> : <><p className="vocab-study-hint">Try to recall the meaning before revealing it. Your answer schedules the next review.</p><div className="vocab-study-actions"><button type="button" className="button button-dark" onClick={() => setRevealed(true)}>Reveal meaning</button></div></>}</> : <div className="notebook-empty"><h3>You&apos;re all caught up</h3><p>No saved words are due right now. New words will appear here automatically.</p></div>}
        </section>
      ) : mode === "flashcards" ? (
        <section className="vocab-study-card" aria-label="Vocabulary flashcard">
          {current ? <><p className="eyebrow">FLASHCARD {cardIndex + 1} OF {filtered.length}</p><h3>{current.phrase}</h3><ListenButton text={`${current.phrase}. ${current.meaning}. ${current.example}`} label={`Listen to ${current.phrase}`} />{revealed ? <><p>{current.meaning}</p><blockquote>{current.example}</blockquote><span className={`vocab-status status-${current.status ?? "learning"}`}>{statusLabels[current.status ?? "learning"]}</span></> : <p className="vocab-study-hint">Try to remember the meaning, then reveal the answer.</p>}<div className="vocab-study-actions">{!revealed ? <button type="button" className="button button-dark" onClick={() => setRevealed(true)}>Reveal meaning</button> : <><button type="button" className="button button-light" onClick={() => changeStatus(current, "learning")}>Still learning</button><button type="button" className="button button-dark" onClick={() => changeStatus(current, "mastered")}>I know this</button></>}<button type="button" className="notebook-secondary" onClick={() => { setCardIndex((index) => (index + 1) % filtered.length); setRevealed(false); }}>Next card →</button></div></> : <div className="notebook-empty"><h3>No cards to review</h3><p>Save a useful phrase from Practice Room to start studying.</p></div>}
        </section>
      ) : mode === "quiz" ? (
        <section className="vocab-study-card" aria-label="Vocabulary meaning quiz">
          {quizWord && quizOptions.length > 1 ? <><p className="eyebrow">QUICK QUIZ · {quizIndex + 1}</p><h3>What does “{quizWord.phrase}” mean?</h3><div className="vocab-quiz-options">{quizOptions.map((option) => <button type="button" key={option.id} className={quizChoice === option.id ? "selected" : ""} disabled={quizAnswered} onClick={() => setQuizChoice(option.id)}>{option.meaning}</button>)}</div>{quizAnswered && <p className={quizChoice === quizWord.id ? "quiz-result correct" : "quiz-result"} role="status">{quizChoice === quizWord.id ? "Correct — nice work!" : `Not quite. The meaning is: ${quizWord.meaning}`}</p>}<div className="vocab-study-actions">{!quizAnswered ? <button type="button" className="button button-dark" disabled={!quizChoice} onClick={() => setQuizAnswered(true)}>Check answer</button> : <button type="button" className="button button-dark" onClick={() => { setQuizIndex((index) => (index + 1) % filtered.length); setQuizChoice(""); setQuizAnswered(false); }}>Next question →</button>}</div></> : <div className="notebook-empty"><h3>Add at least two vocabulary items</h3><p>The quiz needs two or more saved words with meanings. Save phrases from Practice Room.</p></div>}
        </section>
      ) : filtered.length ? (
        <>
        <div className="word-bank-controls">
          <p className="word-bank-count" aria-live="polite">Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} {filtered.length === 1 ? "word" : "words"}</p>
          <div className="word-bank-view-controls">
            <label>Per page <select aria-label="Words per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
            <div className="word-bank-view-toggle" role="group" aria-label="Word bank layout">
              <button type="button" className={displayStyle === "list" ? "active" : ""} aria-pressed={displayStyle === "list"} onClick={() => setDisplayStyle("list")}>List view</button>
              <button type="button" className={displayStyle === "cards" ? "active" : ""} aria-pressed={displayStyle === "cards"} onClick={() => setDisplayStyle("cards")}>Card view</button>
            </div>
          </div>
        </div>
        <div className={displayStyle === "list" ? "saved-word-grid saved-word-list" : "saved-word-grid"}>{visibleWords.map((word) => <article className="saved-word-card" key={word.id}><div className="saved-word-heading"><div><h3>{word.phrase}</h3><ListenButton text={`${word.phrase}. ${word.meaning}. ${word.example}`} label={`Listen to ${word.phrase}`} /><span className={`vocab-status status-${word.status ?? "learning"}`}>{statusLabels[word.status ?? "learning"]}</span></div><button type="button" className="notebook-delete" onClick={() => deleteWord(word)} aria-label={`Delete ${word.phrase}`}>×</button></div><p>{word.meaning}</p><blockquote>{word.example}</blockquote><div className="saved-word-footer"><label>Learning status <select aria-label={`Status for ${word.phrase}`} value={word.status ?? "learning"} onChange={(event) => changeStatus(word, event.target.value as VocabularyStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><small>{new Date(word.savedAt).toLocaleDateString()}</small></div><Link className="vocabulary-detail-link" href={`/vocabulary/${encodeURIComponent(word.id)}`}>Explore this word <span aria-hidden="true">→</span></Link></article>)}</div>
        {pageCount > 1 && <nav className="word-bank-pagination" aria-label="Vocabulary pages">
          <button type="button" className="notebook-secondary" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page === 1}>← Previous</button>
          <div className="word-bank-page-numbers">{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button type="button" key={pageNumber} className={pageNumber === page ? "active" : ""} aria-current={pageNumber === page ? "page" : undefined} aria-label={`Go to page ${pageNumber}`} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}</div>
          <button type="button" className="notebook-secondary" onClick={() => setPage((currentPage) => Math.min(pageCount, currentPage + 1))} disabled={page === pageCount}>Next →</button>
        </nav>}
        </>
      ) : <div className="notebook-empty"><h3>{words.length ? "No matching words" : "Your word bank is ready"}</h3><p>{words.length ? "Try another search or status filter." : "Practice a conversation, ask for feedback, and save phrases to build your personal vocabulary notebook."}</p></div>}
      <p className="storage-note">Your vocabulary is mirrored to the app database when persistence is configured. Status changes and deletions are saved automatically.</p>
    </div>
  );
}
