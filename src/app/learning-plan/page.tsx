import { AppShell } from "@/components/app-shell";
import { LearningPlan } from "@/components/learning-plan";

export default function LearningPlanPage() {
  return (
    <AppShell activePage="learning-plan" title="Daily learning plan" subtitle="A practical routine built around your vocabulary, speaking, and pronunciation practice.">
      <LearningPlan />
    </AppShell>
  );
}
