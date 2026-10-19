import { AppShell } from "@/components/app-shell";
import { AchievementBoard } from "@/components/achievement-board";

export const metadata = { title: "Learning Achievements" };

export default function AchievementsPage() {
  return (
    <AppShell activePage="achievements" title="Learning Achievements" subtitle="Celebrate the habits and skills you are building over time.">
      <AchievementBoard />
    </AppShell>
  );
}
