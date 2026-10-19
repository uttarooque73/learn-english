import { AppShell } from "@/components/app-shell";
import { DailySpeakingMissions } from "@/components/daily-speaking-missions";

export default function DailySpeakingMissionsPage() {
  return (
    <AppShell activePage="daily-speaking-missions" title="Daily Speaking Missions" subtitle="Build a small, consistent speaking habit with a challenge chosen for your current learning needs.">
      <DailySpeakingMissions />
    </AppShell>
  );
}
