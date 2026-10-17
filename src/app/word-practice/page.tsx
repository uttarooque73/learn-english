import { AppShell } from "@/components/app-shell";
import { WordSentencePractice } from "@/components/word-sentence-practice";

export default function WordPracticePage() {
  return (
    <AppShell activePage="word-practice" title="Word & sentence practice" subtitle="Build a stronger vocabulary, write clear sentences, and learn from each attempt.">
      <WordSentencePractice />
    </AppShell>
  );
}
