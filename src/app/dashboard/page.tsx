import { AppShell } from "@/components/app-shell";
import { LearningInsights } from "@/components/learning-insights";
import { DailyGoalCard } from "@/components/daily-goal-card";
import { AdaptiveProgress } from "@/components/adaptive-progress";
import { NextLessonRecommendation } from "@/components/next-lesson-recommendation";
import { MistakeMicroLessons } from "@/components/mistake-micro-lessons";
import { LearningSkillTrends } from "@/components/learning-skill-trends";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <AppShell activePage="dashboard" title="Personal Learning Dashboard" subtitle="See what is improving, spot what needs practice, and celebrate how far you have come.">
      <DailyGoalCard />
      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">YOUR LEARNING PICTURE</p><h2>Your progress at a glance</h2></div>
          <span className="section-note">Live stats from your saved practice</span>
        </div>
        <LearningInsights mode="progress" />
      </section>
      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">GROW YOUR VOCABULARY</p><h2>Build your word power</h2></div>
          <Link className="text-link" href="/daily-vocabulary">Explore all words <span>→</span></Link>
        </div>
        <div className="next-step-card">
          <div className="next-step-icon">Aa</div>
          <div><strong>Every word you learn is progress.</strong><p>Open your complete vocabulary library to review learned words, continue words in progress, and discover what is next.</p></div>
          <Link href="/daily-vocabulary" className="text-link">Open word library <span>→</span></Link>
        </div>
      </section>
      <section className="section-block">
        <NextLessonRecommendation />
      </section>
      <LearningSkillTrends />
      <AdaptiveProgress />
      <MistakeMicroLessons />
    </AppShell>
  );
}
