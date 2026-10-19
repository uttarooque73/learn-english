import { AppShell } from "@/components/app-shell";
import { LearningHistory } from "@/components/learning-history";

export const metadata = { title: "Learning History" };

export default function LearningHistoryPage() {
  return (
    <AppShell activePage="history" title="Learning history" subtitle="Revisit what you practiced, what you learned, and what to improve next.">
      <LearningHistory />
    </AppShell>
  );
}
