"use client";

import Link from "next/link";
import { ListenButton } from "@/components/listen-button";
import { useCallback, useEffect, useState } from "react";
import { getVocabulary, updateVocabularyStatus, type SavedVocabulary, type VocabularyStatus } from "@/lib/learning-storage";

type Example = { sentence: string; context: string; tip: string };
type VocabularyStory = { title: string; paragraph: string; takeaway: string };
const statusLabels: Record<VocabularyStatus, string> = { learning: "Learning", familiar: "Familiar", mastered: "Mastered" };

export function VocabularyDetail({ id }: { id: string }) {
  const [word, setWord] = useState<SavedVocabulary | null>(null);
  const [ready, setReady] = useState(false);
  const [examples, setExamples] = useState<Example[]>([]);
  const [story, setStory] = useState<VocabularyStory | null>(null);
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
      const result = await response.json() as { examples?: Example[]; story?: VocabularyStory; error?: string };
      if (!response.ok || !Array.isArray(result.examples)) throw new Error(result.error || "Could not generate examples.");
      setExamples(result.examples);
      setStory(result.story && typeof result.story.paragraph === "string" ? result.story : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate examples.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const item = getVocabulary().find((saved) => saved.id === id);
      setWord(item ?? null);
      setReady(true);
      if (item) void loadExamples(item);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [id, loadExamples]);

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
  if (!word) return <section className="vocabulary-detail-missing"><span className="eyebrow">WORD NOT FOUND</span><h2>This word isn’t in this browser’s word bank.</h2><p>Saved vocabulary is stored locally on the browser where you added it.</p><Link className="button button-dark" href="/vocabulary">Back to vocabulary</Link></section>;

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

      {story && (
        <section className="vocabulary-story-section" aria-labelledby="vocabulary-story-heading">
          <div className="vocabulary-story-copy">
            <p className="eyebrow">LEARN IT IN CONTEXT</p>
            <h3 id="vocabulary-story-heading">{story.title || `A short story with “${word.phrase}”`}</h3>
            <p className="vocabulary-story-paragraph">{story.paragraph}</p>
            <ListenButton text={`${story.title}. ${story.paragraph}. Key takeaway: ${story.takeaway}`} label="Listen to the short story" />
            {story.takeaway && <p className="vocabulary-story-takeaway"><strong>Remember:</strong> {story.takeaway}</p>}
          </div>
        </section>
      )}

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
