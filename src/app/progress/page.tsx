import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LearningInsights } from "@/components/learning-insights";
import { DailyGoalCard } from "@/components/daily-goal-card";
import { MistakeMicroLessons } from "@/components/mistake-micro-lessons";
import { AdaptiveProgress } from "@/components/adaptive-progress";
import { SkillTrends } from "@/components/skill-trends";

export default function ProgressPage() {
  return (
    <AppShell activePage="progress" title="My progress" subtitle="Notice the small wins. They add up to real confidence.">
      <section className="progress-banner"><div><span className="eyebrow">YOUR JOURNEY, YOUR PACE</span><h2>Progress isn’t perfection.<br /><em>It’s showing up.</em></h2><p>Your saved practice history and assessment evidence help explain how your learning plan changes over time.</p><Link className="button button-light" href="/practice">Continue practicing <span>↗</span></Link></div><div className="progress-art" aria-hidden="true"><div className="progress-ring"><span>✦</span></div><div className="progress-orbit orbit-top">PRACTICE</div><div className="progress-orbit orbit-bottom">GROWTH</div></div></section>
      <DailyGoalCard />
      <section className="section-block"><div className="section-heading"><div><p className="eyebrow">AT A GLANCE</p><h2>Your progress overview</h2></div><span className="section-note">Updates after saved practice</span></div><LearningInsights mode="progress" /></section>
      <section className="section-block"><div className="section-heading"><div><p className="eyebrow">SKILL DEVELOPMENT</p><h2>Measure what is changing</h2></div><span className="section-note">Based on saved speaking reviews</span></div><SkillTrends /></section>
      <AdaptiveProgress />
      <MistakeMicroLessons />
    </AppShell>
  );
}
