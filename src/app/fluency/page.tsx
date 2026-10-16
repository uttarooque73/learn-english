import { AppShell } from "@/components/app-shell";
import { FluencyExercises } from "@/components/fluency-exercises";

export default function FluencyPage() {
  return (
    <AppShell activePage="fluency" title="Fluency & confidence" subtitle="Build the habit of expressing your ideas clearly, one small exercise at a time.">
      <section className="fluency-intro">
        <div><span className="intro-label"><span className="status-dot" /> SMALL STEPS, REAL PRACTICE</span><h2>Speak with less hesitation.<br /><em>One thought at a time.</em></h2><p>Choose a short exercise, organize your thoughts, and practise expressing them in your own words.</p></div>
        <div className="fluency-intro-art" aria-hidden="true"><span>1</span><small>idea</small><i>→</i><span>2</span><small>express</small><i>→</i><span>3</span><small>improve</small></div>
      </section>
      <FluencyExercises />
    </AppShell>
  );
}
