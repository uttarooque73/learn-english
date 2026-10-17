import { AppShell } from "@/components/app-shell";
import { ConversationCoach } from "@/components/conversation-coach";

export default function ConversationCoachPage() {
  return (
    <AppShell activePage="conversation-coach" title="AI Conversation Coach" subtitle="Speak naturally, get thoughtful feedback, and build confidence one conversation at a time.">
      <ConversationCoach />
    </AppShell>
  );
}
