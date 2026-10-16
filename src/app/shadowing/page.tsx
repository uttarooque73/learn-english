import { AppShell } from "@/components/app-shell";
import { ShadowingPractice } from "@/components/shadowing-practice";

export default function ShadowingPage() {
  return (
    <AppShell activePage="shadowing" title="Shadowing & pronunciation" subtitle="Listen closely, repeat with confidence, and build a personal history of the words and sentences you practise.">
      <section className="fluency-intro shadowing-page-intro">
        <div><span className="intro-label"><span className="status-dot" /> LISTEN · REPEAT · IMPROVE</span><h2>Train your ear.<br /><em>Find your rhythm.</em></h2><p>Practise individual words or full sentences, compare your transcript, review speaking rhythm, and return to the phrases that need more work.</p></div>
        <div className="fluency-intro-art" aria-hidden="true"><span>1</span><small>listen</small><i>→</i><span>2</span><small>repeat</small><i>→</i><span>3</span><small>review</small></div>
      </section>
      <ShadowingPractice />
    </AppShell>
  );
}
