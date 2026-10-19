import { AppShell } from "@/components/app-shell";
import { LearningActivityCalendar } from "@/components/learning-activity-calendar";

export const metadata = { title: "Learning Activity Calendar" };

export default function LearningCalendarPage() {
  return (
    <AppShell activePage="activity-calendar" title="Learning Activity Calendar" subtitle="See the habits you are building, day by day.">
      <LearningActivityCalendar />
    </AppShell>
  );
}
