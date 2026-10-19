import { AppShell } from "@/components/app-shell";
import { ChallengeSimulator } from "@/components/challenge-simulator";

export default function ChallengeSimulatorPage() {
  return (
    <AppShell activePage="challenge-simulator" title="Real-World Challenge Simulator" subtitle="Rehearse important conversations, get feedback, and try again with confidence.">
      <ChallengeSimulator />
    </AppShell>
  );
}
