import { AppShell } from "@/components/app-shell";
import { LearningPlan } from "@/components/learning-plan";
import { MistakeMicroLessons } from "@/components/mistake-micro-lessons";

export default function LearningPlanPage() {
  return (
    <AppShell activePage="learning-plan" title="Daily learning plan" subtitle="A practical routine built around your vocabulary, speaking, and pronunciation practice.">
      <LearningPlan />
      <MistakeMicroLessons />
    </AppShell>
  );
}
