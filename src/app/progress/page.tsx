import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LearningInsights } from "@/components/learning-insights";

export default function ProgressPage() {
  return (
    <AppShell activePage="progress" title="My progress" subtitle="Notice the small wins. They add up to real confidence.">
      <section className="progress-banner"><div><span className="eyebrow">YOUR JOURNEY, YOUR PACE</span><h2>Progress isn’t perfection.<br /><em>It’s showing up.</em></h2><p>Your completed conversations and practice time are recorded locally as you learn.</p><Link className="button button-light" href="/practice">Continue practicing <span>↗</span></Link></div><div className="progress-art" aria-hidden="true"><div className="progress-ring"><span>✦</span></div><div className="progress-orbit orbit-top">PRACTICE</div><div className="progress-orbit orbit-bottom">GROWTH</div></div></section>
      <section className="section-block"><div className="section-heading"><div><p className="eyebrow">AT A GLANCE</p><h2>Your progress overview</h2></div><span className="section-note">Updates after successful conversations</span></div><LearningInsights mode="progress" /></section>
    </AppShell>
  );
}
