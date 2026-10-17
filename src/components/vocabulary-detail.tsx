"use client";

import Link from "next/link";
import { ListenButton } from "@/components/listen-button";
import { useCallback, useEffect, useState } from "react";
import { getVocabulary, updateVocabularyStatus, type SavedVocabulary, type VocabularyStatus } from "@/lib/learning-storage";
import { initializeDatabasePersistence } from "@/lib/client-persistence";

type Example = { sentence: string; context: string; tip: string };
type VocabularyStory = { title: string; paragraph: string; takeaway: string };
type VocabularyDetails = { pronunciation: string; partOfSpeech: string; simpleDefinition: string; nuance: string; synonyms: string[]; antonyms: string[]; collocations: string[]; wordForms: { form: string; usage: string }[]; commonMistake: string; memoryTip: string };
const statusLabels: Record<VocabularyStatus, string> = { learning: "Learning", familiar: "Familiar", mastered: "Mastered" };

export function VocabularyDetail({ id }: { id: string }) {
  const [word, setWord] = useState<SavedVocabulary | null>(null);
  const [ready, setReady] = useState(false);
  const [examples, setExamples] = useState<Example[]>([]);
  const [story, setStory] = useState<VocabularyStory | null>(null);
  const [details, setDetails] = useState<VocabularyDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedExample, setCopiedExample] = useState(-1);

  const loadExamples = useCallback(async (item: SavedVocabulary) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/vocabulary/examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: item.phrase, meaning: item.meaning }),
      });
      const result = await response.json() as { examples?: Example[]; error?: string };
      if (!response.ok || !Array.isArray(result.examples)) throw new Error(result.error || "Could not generate examples.");
      setExamples(result.examples);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate examples.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStory = useCallback(async (item: SavedVocabulary) => {
    setStoryLoading(true);
    setStoryError("");
    try {
      const response = await fetch("/api/vocabulary/examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: item.phrase, meaning: item.meaning, mode: "story" }),
      });
      const result = await response.json() as { story?: VocabularyStory; error?: string };
      if (!response.ok || !result.story || typeof result.story.paragraph !== "string") throw new Error(result.error || "Could not generate the story.");
      setStory(result.story);
    } catch (err) {
      setStoryError(err instanceof Error ? err.message : "Could not generate the story.");
    } finally {
      setStoryLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (item: SavedVocabulary) => {
    setDetailsLoading(true);
    setDetailsError("");
    try {
      const response = await fetch("/api/vocabulary/examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: item.phrase, meaning: item.meaning, mode: "details" }),
      });
      const result = await response.json() as { details?: VocabularyDetails; error?: string };
      if (!response.ok || !result.details || typeof result.details.simpleDefinition !== "string") throw new Error(result.error || "Could not generate word details.");
      setDetails(result.details);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Could not generate word details.");
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().then(() => {
      if (!active) return;
      const item = getVocabulary().find((saved) => saved.id === id);
      setWord(item ?? null);
      setReady(true);
      if (item) {
        void loadExamples(item);
        void loadDetails(item);
      }
    }).catch((caught) => {
      if (!active) return;
      setError(caught instanceof Error ? caught.message : "Could not load saved vocabulary from the database.");
      setReady(true);
    });
    return () => { active = false; };
  }, [id, loadExamples, loadDetails]);

  function changeStatus(status: VocabularyStatus) {
    if (!word) return;
    updateVocabularyStatus(word.id, status);
    setWord({ ...word, status });
  }

  async function copySentence(sentence: string, index: number) {
    try {
      await navigator.clipboard.writeText(sentence);
      setCopiedExample(index);
      window.setTimeout(() => setCopiedExample((current) => current === index ? -1 : current), 1800);
    } catch {
      setError("Clipboard access is unavailable in this browser. You can select and copy the sentence manually.");
    }
  }

  if (!ready) return <div className="notebook-empty" aria-live="polite">Opening your word…</div>;
  if (!word) return <section className="vocabulary-detail-missing"><span className="eyebrow">WORD NOT FOUND</span><h2>This word isn’t in your saved vocabulary.</h2><p>{error || "Your saved vocabulary is loaded from your SpeakUp database. If this word is missing, it may have been removed or saved under a different browser profile."}</p><Link className="button button-dark" href="/vocabulary">Back to vocabulary</Link></section>;

  return (
    <div className="vocabulary-detail-page">
      <Link href="/vocabulary" className="vocabulary-back-link">← All vocabulary</Link>
      <section className="vocabulary-detail-hero">
        <div className="vocabulary-detail-wordmark">Aa</div>
        <div className="vocabulary-detail-heading">
          <p className="eyebrow">YOUR WORD, IN CONTEXT</p>
          <h2>{word.phrase}</h2>
          <p>{word.meaning || "Keep exploring how this word is used in natural English."}</p><ListenButton text={`${word.phrase}. ${word.meaning}`} label={`Listen to ${word.phrase}`} />
          <div className="vocabulary-detail-meta"><span className="vocabulary-detail-category">{word.category || "vocabulary"}</span><span className={`vocab-status status-${word.status ?? "learning"}`}>{statusLabels[word.status ?? "learning"]}</span></div>
        </div>
      </section>

      <section className="vocabulary-word-guide" aria-labelledby="vocabulary-word-guide-heading">
        <div className="vocabulary-word-guide-header">
          <div><p className="eyebrow">GO BEYOND THE MEANING</p><h3 id="vocabulary-word-guide-heading">Word guide</h3><p>Explore pronunciation, word type, similar words, common phrases, and mistakes.</p></div>
          <button type="button" className="notebook-secondary" onClick={() => void loadDetails(word)} disabled={detailsLoading}>{detailsLoading ? "Generating word guide…" : "Regenerate word guide ↻"}</button>
        </div>
        {detailsLoading && <div className="vocabulary-examples-loading" role="status"><span className="vocabulary-loading-dot" /><div><strong>Building your word guide</strong><p>Finding useful ways to understand and use “{word.phrase}”.</p></div></div>}
        {detailsError && <div className="vocabulary-detail-error" role="alert"><p>{detailsError}</p><button type="button" className="notebook-secondary" onClick={() => void loadDetails(word)} disabled={detailsLoading}>Try again</button></div>}
        {!details && !detailsLoading && !detailsError && <p className="vocabulary-story-empty">Your word guide will be generated automatically when this page opens.</p>}
        {details && !detailsLoading && <div className="vocabulary-word-guide-content">
          <div className="vocabulary-word-guide-definition"><div><span className="vocabulary-guide-label">PRONUNCIATION</span><p>{details.pronunciation || "Not available"}</p></div><div><span className="vocabulary-guide-label">PART OF SPEECH</span><p>{details.partOfSpeech || "Not specified"}</p></div><div className="vocabulary-word-guide-definition-main"><span className="vocabulary-guide-label">IN SIMPLE ENGLISH</span><p>{details.simpleDefinition}</p></div></div>
          {details.nuance && <div className="vocabulary-guide-note"><strong>Meaning and nuance</strong><p>{details.nuance}</p></div>}
          <div className="vocabulary-guide-lists">
            {details.synonyms?.length > 0 && <div><h4>Similar words</h4><div className="vocabulary-guide-chips">{details.synonyms.map((item) => <span key={item}>{item}</span>)}</div></div>}
            {details.antonyms?.length > 0 && <div><h4>Opposite words</h4><div className="vocabulary-guide-chips">{details.antonyms.map((item) => <span key={item}>{item}</span>)}</div></div>}
            {details.collocations?.length > 0 && <div><h4>Common word combinations</h4><div className="vocabulary-guide-chips">{details.collocations.map((item) => <span key={item}>{item}</span>)}</div></div>}
          </div>
          {details.wordForms?.length > 0 && <div className="vocabulary-guide-forms"><h4>Word forms</h4>{details.wordForms.map((item) => <div key={item.form}><strong>{item.form}</strong><span>{item.usage}</span></div>)}</div>}
          {details.commonMistake && <div className="vocabulary-guide-note"><strong>Common mistake to avoid</strong><p>{details.commonMistake}</p></div>}
          {details.memoryTip && <div className="vocabulary-guide-memory"><strong>Memory tip</strong><p>{details.memoryTip}</p></div>}
          <ListenButton text={["Word guide for " + word.phrase, "Pronunciation: " + details.pronunciation, "Part of speech: " + details.partOfSpeech, "Meaning: " + details.simpleDefinition, details.nuance, "Similar words: " + details.synonyms.join(", "), "Common phrases: " + details.collocations.join(", "), "Common mistake: " + details.commonMistake, "Memory tip: " + details.memoryTip].filter(Boolean).join(". ")} label="Listen to word guide" />
        </div>}
      </section>

            <section className="vocabulary-story-section" aria-labelledby="vocabulary-story-heading">
        <div className="vocabulary-story-copy">
          <div className="vocabulary-story-header">
            <div>
              <p className="eyebrow">READ AND LISTEN</p>
              <h3 id="vocabulary-story-heading">Learn “{word.phrase}” through a short story</h3>
              <p className="vocabulary-story-intro">Generate a short, easy-to-read story using this word in a natural situation.</p>
            </div>
            <button type="button" className="notebook-secondary" onClick={() => void loadStory(word)} disabled={storyLoading}>
              {storyLoading ? "Generating story…" : story ? "Generate another story ↻" : "Generate story ↗"}
            </button>
          </div>
          {storyLoading && <div className="vocabulary-examples-loading" role="status"><span className="vocabulary-loading-dot" /><div><strong>Writing your story</strong><p>Creating a simple story around “{word.phrase}”.</p></div></div>}
          {storyError && <div className="vocabulary-detail-error" role="alert"><p>{storyError}</p><button type="button" className="notebook-secondary" onClick={() => void loadStory(word)} disabled={storyLoading}>Try again</button></div>}
          {!story && !storyLoading && !storyError && <p className="vocabulary-story-empty">Your story will appear here. Select <strong>Generate story</strong> when you’re ready.</p>}
          {story && !storyLoading && <>
            <h4 className="vocabulary-story-title">{story.title || `A short story with “${word.phrase}”`}</h4>
            <p className="vocabulary-story-paragraph">{story.paragraph}</p>
            <ListenButton text={`${story.title}. ${story.paragraph}. Key takeaway: ${story.takeaway}`} label="Listen to the short story" />
            {story.takeaway && <p className="vocabulary-story-takeaway"><strong>Remember:</strong> {story.takeaway}</p>}
          </>}
        </div>
      </section>

            <section className="vocabulary-detail-section">
        <div className="vocabulary-detail-section-heading"><div><p className="eyebrow">LEARN THROUGH EXAMPLES</p><h3>See it in real sentences</h3><p>Different situations help you understand when and how to use this word naturally.</p></div><button type="button" className="notebook-secondary" onClick={() => void loadExamples(word)} disabled={loading}>{loading ? "Creating examples…" : examples.length ? "Generate new examples ↻" : "Generate examples ↗"}</button></div>
        {loading && examples.length === 0 && <div className="vocabulary-examples-loading" role="status"><span className="vocabulary-loading-dot" /><div><strong>Building your example set</strong><p>Creating natural sentences across everyday life, work, and conversation.</p></div></div>}
        {error && <div className="vocabulary-detail-error" role="alert"><p>{error}</p><button type="button" className="notebook-secondary" onClick={() => void loadExamples(word)} disabled={loading}>Try again</button></div>}
        {examples.length > 0 && <div className="vocabulary-example-grid">{examples.map((example, index) => <article className="vocabulary-example-card" key={`${index}-${example.sentence}`}><div className="vocabulary-example-top"><span className="vocabulary-example-number">{String(index + 1).padStart(2, "0")}</span><span className="vocabulary-example-context">{example.context}</span></div><p className="vocabulary-example-sentence">{example.sentence}</p><ListenButton text={example.sentence} label={`Listen to example ${index + 1}`} /><p className="vocabulary-example-tip"><span>Usage tip</span>{example.tip}</p><ListenButton text={example.tip} label={`Listen to usage tip ${index + 1}`} /><button type="button" className="vocabulary-copy-example" onClick={() => void copySentence(example.sentence, index)}>{copiedExample === index ? "Copied ✓" : "Copy sentence ↗"}</button></article>)}</div>}
        {!loading && !error && examples.length === 0 && <div className="notebook-empty"><h3>Let’s build your examples</h3><p>Generate several natural sentences that show how to use this word.</p><button type="button" className="button button-dark" onClick={() => void loadExamples(word)}>Generate examples</button></div>}
      </section>

      <section className="vocabulary-detail-practice">
        <div><p className="eyebrow">MAKE IT STICK</p><h3>Make this word part of your English</h3><p>Change its learning status as you become more confident using it.</p></div>
        <label>Learning status<select aria-label="Learning status" value={word.status ?? "learning"} onChange={(event) => changeStatus(event.target.value as VocabularyStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Link href="/practice" className="button button-dark">Practice in a conversation <span>↗</span></Link>
      </section>
    </div>
  );
}
