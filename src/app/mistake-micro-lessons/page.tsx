import { AppShell } from "@/components/app-shell";
import { MistakeMicroLessons } from "@/components/mistake-micro-lessons";

export default function MistakeMicroLessonsPage() {
  return (
    <AppShell
      activePage="mistake-micro-lessons"
      title="Mistake Micro-Lessons"
      subtitle="Turn recurring speaking corrections into short, targeted practice quizzes."
    >
      <MistakeMicroLessons />
    </AppShell>
  );
}
