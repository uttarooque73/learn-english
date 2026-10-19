import { AppShell } from "@/components/app-shell";
import { AdaptiveVocabularyContext } from "@/components/adaptive-vocabulary-context";

export default function AdaptiveVocabularyPage() {
  return (
    <AppShell activePage="adaptive-vocabulary" title="Adaptive Vocabulary in Context" subtitle="Learn reusable English phrases through realistic conversations at your level.">
      <AdaptiveVocabularyContext />
    </AppShell>
  );
}
