import { AppShell } from "@/components/app-shell";
import { AiPersonalTutor } from "@/components/ai-personal-tutor";

export default function AiTutorPage() {
  return (
    <AppShell activePage="ai-tutor" title="AI Personal Tutor" subtitle="Get focused English practice, helpful explanations, and a next step tailored to your goal.">
      <AiPersonalTutor />
    </AppShell>
  );
}
