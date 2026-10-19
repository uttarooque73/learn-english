import { AppShell } from "@/components/app-shell";
import { ListeningComprehensionLab } from "@/components/listening-comprehension-lab";

export default function ListeningLabPage() {
  return (
    <AppShell activePage="listening-lab" title="Listening Comprehension Lab" subtitle="Train your ear with short real-world passages, focused questions, and replay practice.">
      <ListeningComprehensionLab />
    </AppShell>
  );
}
