"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ListenButton } from "@/components/listen-button";
import { getDueVocabulary, getVocabulary, reviewVocabulary, type SavedVocabulary, type VocabularyReviewRating } from "@/lib/learning-storage";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import styles from "./smart-vocabulary-revision.module.css";

const ratings: { value: VocabularyReviewRating; label: string; hint: string }[] = [
  { value: "again", label: "Again", hint: "I forgot it" },
  { value: "hard", label: "Hard", hint: "It was difficult" },
  { value: "good", label: "Good", hint: "I remembered" },
  { value: "easy", label: "Easy", hint: "I knew it well" },
];

function readableDate(value?: string) {
  if (!value) return "soon";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "soon";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SmartVocabularyRevision() {
  const [words, setWords] = useState<SavedVocabulary[]>([]);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (!active) return;
      const saved = getVocabulary();
      setWords(saved);
      setSessionTotal(getDueVocabulary().length);
      setReady(true);
    }).catch(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  const dueWords = useMemo(() => {
    const savedIds = new Set(words.map((word) => word.id));
    return getDueVocabulary().filter((word) => savedIds.has(word.id));
  }, [words]);
  const current = dueWords[0];
  const masteredCount = words.filter((word) => word.status === "mastered").length;
  const progress = sessionTotal > 0 ? Math.min(100, Math.round((sessionReviewed / sessionTotal) * 100)) : 0;

  function refresh() {
    setWords(getVocabulary());
    setRevealed(false);
  }

  function rateWord(rating: VocabularyReviewRating) {
    if (!current) return;
    const reviewed = reviewVocabulary(current.id, rating);
    if (!reviewed) {
      setNotice("This word could not be updated. Please try again.");
      return;
    }
    setSessionReviewed((count) => count + 1);
    setNotice(rating === "again" ? "No problem — this word is scheduled for another review." : "Review saved. Keep going!");
    refresh();
  }

  if (!ready) {
    return <div className={styles.loading} role="status">Loading your saved vocabulary…</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.intro}>
        <div>
          <p className={styles.kicker}>REMEMBER WHAT YOU LEARN</p>
          <h2>Small reviews.<br /><span>Stronger memory.</span></h2>
          <p className={styles.description}>Recall a word before revealing its meaning. Your answers schedule the next review, so you can spend time on the words that need it most.</p>
        </div>
        <div className={styles.introMark} aria-hidden="true"><span>Aa</span><small>RECALL · REVIEW · RETAIN</small></div>
      </section>

      <section className={styles.stats} aria-label="Vocabulary review statistics">
        <div className={styles.stat}><span>Due now</span><strong>{dueWords.length}</strong><small>ready to practise</small></div>
        <div className={styles.stat}><span>In your word bank</span><strong>{words.length}</strong><small>saved words and phrases</small></div>
        <div className={styles.stat}><span>Mastered</span><strong>{masteredCount}</strong><small>rated easy at review</small></div>
      </section>

      {words.length === 0 ? (
        <section className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden="true">✦</div>
          <h3>Your review deck starts with your word bank</h3>
          <p>Save useful words or phrases first. They will appear here automatically, with a review schedule that adapts to your answers.</p>
          <Link className={styles.primaryButton} href="/vocabulary">Open my vocabulary</Link>
        </section>
      ) : current ? (
        <section className={styles.reviewPanel} aria-label="Vocabulary review">
          <div className={styles.reviewTop}>
            <div><p className={styles.kicker}>YOUR REVIEW SESSION</p><h3>What does this mean?</h3></div>
            <span className={styles.counter}>{dueWords.length} {dueWords.length === 1 ? "word" : "words"} left</span>
          </div>
          <div className={styles.progressTrack} role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + "%" }} /></div>
          <div className={styles.flashcard}>
            <span className={styles.wordType}>{current.category || "vocabulary"}</span>
            <h2>{current.phrase}</h2>
            <div className={styles.wordActions}><ListenButton text={current.phrase} label="Hear word" /></div>
            {revealed ? (
              <div className={styles.answer} aria-live="polite">
                <div><span>MEANING</span><p>{current.meaning}</p></div>
                {current.example && <div><span>EXAMPLE</span><p className={styles.example}>{current.example}</p></div>}
                {current.sourceExamples?.length ? <div><span>FROM YOUR PRACTICE</span><p className={styles.example}>{current.sourceExamples[0]}</p></div> : null}
              </div>
            ) : (
              <p className={styles.recallPrompt}>Try to remember the meaning and use it in a sentence before you reveal the answer.</p>
            )}
          </div>
          {!revealed ? (
            <button className={styles.primaryButton} type="button" onClick={() => setRevealed(true)}>Reveal meaning <span aria-hidden="true">↓</span></button>
          ) : (
            <div className={styles.ratingSection}>
              <p>How well did you remember it?</p>
              <div className={styles.ratingGrid}>
                {ratings.map((rating) => (
                  <button className={styles.ratingButton} key={rating.value} type="button" onClick={() => rateWord(rating.value)}>
                    <strong>{rating.label}</strong><span>{rating.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          <p className={styles.scheduleNote}>Again: 1 day · Hard: 2 days · Good: 3 days · Easy: 7 days</p>
        </section>
      ) : (
        <section className={styles.complete} aria-live="polite">
          <div className={styles.completeIcon} aria-hidden="true">✓</div>
          <p className={styles.kicker}>SESSION COMPLETE</p>
          <h3>You’re all caught up.</h3>
          <p>You reviewed {sessionReviewed} {sessionReviewed === 1 ? "word" : "words"} this session. Your next reviews will appear here when they are due.</p>
          {words.some((word) => word.nextReviewAt) && <p className={styles.nextReview}>Next scheduled review: {readableDate(words.map((word) => word.nextReviewAt).filter(Boolean).sort()[0])}</p>}
          <Link className={styles.primaryButton} href="/vocabulary">Explore my word bank</Link>
        </section>
      )}
      {ready && words.length > 0 && <div className={styles.footerLinks}><Link href="/vocabulary">Manage vocabulary</Link><span>·</span><Link href="/daily-vocabulary">Learn new words</Link></div>}
    </div>
  );
}
