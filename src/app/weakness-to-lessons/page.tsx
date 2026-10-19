import { AppShell } from "@/components/app-shell";
import { WeaknessToLessonRecommendations } from "@/components/weakness-to-lesson-recommendations";

export default function WeaknessToLessonsPage() {
  return (
    <AppShell activePage="weakness-to-lessons" title="Your next best lessons" subtitle="Turn saved assessment evidence into focused practice for grammar, vocabulary, and speaking.">
      <WeaknessToLessonRecommendations />
    </AppShell>
  );
}
