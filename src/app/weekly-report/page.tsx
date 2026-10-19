import { AppShell } from "@/components/app-shell";
import { WeeklyLearningReport } from "@/components/weekly-learning-report";

export default function WeeklyReportPage() {
  return (
    <AppShell activePage="weekly-report" title="Weekly AI Learning Report" subtitle="See the habits, feedback, and next steps that matter most this week.">
      <WeeklyLearningReport />
    </AppShell>
  );
}
