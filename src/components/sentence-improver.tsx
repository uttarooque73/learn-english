"use client";

import { FormEvent, useState } from "react";

type Improvement = {
  original: string;
  corrected: string;
  natural: string;
  explanation: string;
  encouragement: string;
  practicePrompt: string;
};

export function SentenceImprover() {
  const [sentence, setSentence] = useState("");
  const [result, setResult] = useState<Improvement | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function reviewSentence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sentence.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/grammar/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence: sentence.trim() }),
      });
      const data = (await response.json()) as { improvement?: Improvement; error?: string };
      if (!response.ok || !data.improvement) throw new Error(data.error || "We couldn't review that sentence. Please try again.");
      setResult(data.improvement);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sentence-improver">
      <section className="improver-entry">
        <div className="improver-entry-heading"><span className="improver-icon">Aa</span><div><h2>Write it your way</h2><p>Type a sentence exactly as you would say it. Mistakes are welcome here.</p></div></div>
        <form onSubmit={reviewSentence}>
          <label htmlFor="sentence-to-improve">Your sentence</label>
          <textarea id="sentence-to-improve" value={sentence} onChange={(event) => setSentence(event.target.value)} maxLength={2000} rows={4} placeholder="For example: Yesterday I go office..." required aria-describedby="sentence-helper" />
          <div className="improver-form-footer"><span id="sentence-helper">{sentence.length}/2,000 characters · No grades, just helpful feedback</span><button className="button button-dark" type="submit" disabled={loading || !sentence.trim()}>{loading ? "Reviewing…" : "Improve my sentence"} <span aria-hidden="true">↗</span></button></div>
        </form>
        {error && <p className="improver-error" role="alert">{error}</p>}
      </section>

      {loading && <div className="improver-loading" role="status"><span className="improver-spinner" />Looking for a clear, natural way to say it…</div>}

      {result && <section className="improver-results" aria-live="polite">
        <div className="improver-encouragement"><span aria-hidden="true">✦</span><p>{result.encouragement}</p></div>
        <div className="improver-result-card"><span className="improver-label">GRAMMAR-CORRECT VERSION</span><p className="improver-corrected">{result.corrected}</p></div>
        <div className="improver-result-card natural-card"><span className="improver-label">A MORE NATURAL WAY TO SAY IT</span><p className="improver-corrected">{result.natural}</p></div>
        <div className="improver-explanation"><span className="improver-explanation-icon" aria-hidden="true">?</span><div><h3>Why this works</h3><p>{result.explanation}</p></div></div>
        <div className="improver-practice"><span className="eyebrow">YOUR TURN</span><p>{result.practicePrompt}</p><button type="button" className="text-link improver-try-again" onClick={() => { setSentence(""); setResult(null); setError(""); document.getElementById("sentence-to-improve")?.focus(); }}>Try another sentence <span aria-hidden="true">→</span></button></div>
      </section>}

      {!result && !loading && <div className="improver-example"><span className="eyebrow">A LITTLE EXAMPLE</span><p className="improver-example-before">“Yesterday I go office.”</p><p className="improver-example-after"><span aria-hidden="true">↳</span> “Yesterday I went to the office.”</p><p className="improver-example-note">Use the past tense for yesterday, and “the office” when talking about your workplace.</p></div>}
    </div>
  );
}
