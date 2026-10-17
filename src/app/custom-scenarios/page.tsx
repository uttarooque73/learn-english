import { AppShell } from "@/components/app-shell";
import { CustomScenarioBuilder } from "@/components/custom-scenario-builder";

export default function CustomScenariosPage() {
  return (
    <AppShell activePage="custom-scenarios" title="Custom scenarios" subtitle="Rehearse the exact conversation you need to have in real life.">
      <section className="practice-intro">
        <div>
          <span className="intro-label"><span className="status-dot" /> REAL LIFE, REHEARSED</span>
          <h2>Prepare for the<br /><em>conversation ahead.</em></h2>
          <p>Describe what is coming up. Build a realistic practice partner and rehearse until you feel ready.</p>
        </div>
        <div className="practice-illustration" aria-hidden="true"><div className="practice-circle circle-back" /><div className="practice-circle circle-front"><span>✦</span></div><span className="practice-star star-a">✳</span><span className="practice-star star-b">↗</span></div>
      </section>
      <CustomScenarioBuilder />
    </AppShell>
  );
}
