import { AppShell } from "@/components/app-shell";
import { LiveSpeakingRoleplay } from "@/components/live-speaking-roleplay";

export default function LiveSpeakingRoleplayPage() {
  return (
    <AppShell activePage="live-speaking-roleplay" title="Live Speaking Roleplay" subtitle="Practise realistic conversations, then get a focused debrief on your English.">
      <LiveSpeakingRoleplay />
    </AppShell>
  );
}
