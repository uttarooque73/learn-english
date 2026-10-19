import { AppShell } from "@/components/app-shell";
import { LearningInsights } from "@/components/learning-insights";
import { DailyGoalCard } from "@/components/daily-goal-card";
import { AdaptiveProgress } from "@/components/adaptive-progress";
import { NextLessonRecommendation } from "@/components/next-lesson-recommendation";
import { MistakeMicroLessons } from "@/components/mistake-micro-lessons";
import { LearningSkillTrends } from "@/components/learning-skill-trends";

export default function DashboardPage() {
  return (
    <AppShell activePage="dashboard" title="Personal Learning Dashboard" subtitle="See what is improving, spot what needs practice, and choose your next step.">
      <DailyGoalCard />
      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">YOUR LEARNING PICTURE</p><h2>Progress you can act on</h2></div>
          <span className="section-note">Based on your saved practice history</span>
        </div>
        <LearningInsights mode="progress" />
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
