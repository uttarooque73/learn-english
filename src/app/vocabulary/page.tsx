import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function VocabularyPage() {
  return (
    <AppShell activePage="vocabulary" title="My vocabulary" subtitle="Keep the words and expressions you want to make your own.">
      <section className="vocab-hero"><div><span className="eyebrow">YOUR PERSONAL WORD BANK</span><h2>New words become<br /><em>your words.</em></h2><p>Save useful phrases from conversations and revisit them whenever you need a little reminder.</p></div><div className="vocab-art" aria-hidden="true"><div className="vocab-card vocab-card-back">phrase</div><div className="vocab-card vocab-card-front"><span>Aa</span><small>word by word</small></div><span className="vocab-spark">✦</span></div></section>
      <section className="empty-state"><div className="empty-illustration"><span>Aa</span><i>✦</i></div><p className="eyebrow">A FRESH PAGE</p><h2>Your word bank starts here</h2><p>Once vocabulary saving is connected, your saved words, meanings, and example sentences will appear here.</p><Link href="/practice" className="button button-dark">Go to practice <span>↗</span></Link></section>
    </AppShell>
  );
}
