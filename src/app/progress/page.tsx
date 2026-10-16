import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function ProgressPage() {
  return (
    <AppShell activePage="progress" title="My progress" subtitle="Notice the small wins. They add up to real confidence.">
      <section className="progress-banner"><div><span className="eyebrow">YOUR JOURNEY, YOUR PACE</span><h2>Progress isn’t perfection.<br /><em>It’s showing up.</em></h2><p>Your practice history will turn into a personal picture of how far you’ve come.</p><Link className="button button-light" href="/practice">Start building your progress <span>↗</span></Link></div><div className="progress-art" aria-hidden="true"><div className="progress-ring"><span>✦</span></div><div className="progress-orbit orbit-top">PRACTICE</div><div className="progress-orbit orbit-bottom">GROWTH</div></div></section>
      <section className="section-block"><div className="section-heading"><div><p className="eyebrow">AT A GLANCE</p><h2>Your progress overview</h2></div><span className="section-note">No data yet — and that’s okay</span></div>
        <div className="stats-grid progress-stats"><article className="stat-card"><div className="stat-top"><span className="stat-icon peach">◷</span><span className="stat-tag">TIME</span></div><div className="stat-value">0 <small>min</small></div><p>Total speaking practice</p><div className="stat-foot">Your time will add up here</div></article><article className="stat-card"><div className="stat-top"><span className="stat-icon lavender">↗</span><span className="stat-tag">CONSISTENCY</span></div><div className="stat-value">0</div><p>Sessions completed</p><div className="stat-foot">Every session is a win</div></article><article className="stat-card"><div className="stat-top"><span className="stat-icon mint">Aa</span><span className="stat-tag">VOCABULARY</span></div><div className="stat-value">0</div><p>Words collected</p><div className="stat-foot">Learn words in context</div></article></div>
      </section>
      <section className="empty-state progress-empty"><div className="empty-illustration"><span>↗</span><i>✦</i></div><p className="eyebrow">YOUR STORY IS JUST BEGINNING</p><h2>Your first session sets the baseline</h2><p>After practice history is implemented, this page will show activity over time and the areas you are improving.</p><Link href="/practice" className="button button-dark">Start your first session <span>↗</span></Link></section>
    </AppShell>
  );
}
