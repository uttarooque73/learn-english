import { AppShell } from "@/components/app-shell";
import { SpeakUpAdventures } from "@/components/speakup-adventures";

export default function SpeakUpAdventuresPage() {
  return (
    <AppShell activePage="speakup-adventures" title="SpeakUp Adventures" subtitle="Explore a story, meet AI characters, and unlock new places with every conversation.">
      <SpeakUpAdventures />
    </AppShell>
  );
}
