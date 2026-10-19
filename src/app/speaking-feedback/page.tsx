import { AppShell } from "@/components/app-shell";
import { SpeakingFeedback } from "@/components/speaking-feedback";

export default function SpeakingFeedbackPage() {
  return (
    <AppShell activePage="speaking-feedback" title="AI Speaking Feedback" subtitle="Turn a spoken response into clear, actionable feedback on your English.">
      <SpeakingFeedback />
    </AppShell>
  );
}
