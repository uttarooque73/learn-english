import { AppShell } from "@/components/app-shell";
import { WordSentencePractice } from "@/components/word-sentence-practice";

export default function WordPracticePage() {
  return (
    <AppShell activePage="word-practice" title="Speaking practice" subtitle="Speak words and sentences aloud, then improve with personalized feedback.">
      <WordSentencePractice />
    </AppShell>
  );
}
