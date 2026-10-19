import { AppShell } from "@/components/app-shell";
import { EnglishQuest } from "@/components/english-quest";

export default function EnglishQuestPage() {
  return (
    <AppShell activePage="english-quest" title="English Quest" subtitle="Real-world missions that turn practice into progress.">
      <EnglishQuest />
    </AppShell>
  );
}
