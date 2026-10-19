import { AppShell } from "@/components/app-shell";
import { SentenceImprover } from "@/components/sentence-improver";

export default function SentenceImproverPage() {
  return (
    <AppShell activePage="sentence-improver" title="Smart Grammar & Sentence Improver" subtitle="Make your English clearer and more natural, one sentence at a time.">
      <section className="improver-hero">
        <div><span className="improver-hero-kicker">PRACTICE WITHOUT PRESSURE</span><h2>Every sentence is<br /><em>a chance to grow.</em></h2><p>Get a gentle correction, understand why it works, and try again. You do not need perfect English to get started.</p></div>
        <div className="improver-hero-art" aria-hidden="true"><span className="hero-art-large">Aa</span><span className="hero-art-spark">✦</span><span className="hero-art-note">clearer words<br />more confidence</span></div>
      </section>
      <SentenceImprover />
    </AppShell>
  );
}
