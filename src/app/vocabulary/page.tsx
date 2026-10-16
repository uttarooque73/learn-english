import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { VocabularyNotebook } from "@/components/vocabulary-notebook";

export default function VocabularyPage() {
  return (
    <AppShell activePage="vocabulary" title="My vocabulary" subtitle="Keep the words and expressions you want to make your own.">
      <section className="vocab-hero"><div><span className="eyebrow">YOUR PERSONAL WORD BANK</span><h2>New words become<br /><em>your words.</em></h2><p>Save useful phrases from AI feedback and revisit them whenever you need a reminder.</p><Link className="button button-dark" href="/practice">Find useful phrases <span>↗</span></Link></div><div className="vocab-art" aria-hidden="true"><div className="vocab-card vocab-card-back">phrase</div><div className="vocab-card vocab-card-front"><span>Aa</span><small>word by word</small></div><span className="vocab-spark">✦</span></div></section>
      <section className="section-block"><div className="section-heading"><div><p className="eyebrow">SAVED BY YOU</p><h2>Your word bank</h2></div><span className="section-note">Stored on this browser</span></div><VocabularyNotebook /></section>
    </AppShell>
  );
}
