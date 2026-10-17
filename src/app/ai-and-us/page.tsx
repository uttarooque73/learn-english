import { AppShell } from "@/components/app-shell";
import { AiAndUsPractice } from "@/components/ai-and-us-practice";

export default function AiAndUsPage() {
  return (
    <AppShell activePage="ai-and-us" title="AI and Us" subtitle="Read along with AI, practise your own paragraphs, and build confidence one sentence at a time.">
      <AiAndUsPractice />
    </AppShell>
  );
}
