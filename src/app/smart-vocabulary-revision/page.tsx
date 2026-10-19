import { AppShell } from "@/components/app-shell";
import { SmartVocabularyRevision } from "@/components/smart-vocabulary-revision";

export default function SmartVocabularyRevisionPage() {
  return (
    <AppShell activePage="smart-vocabulary-revision" title="Smart Vocabulary Revision" subtitle="Remember useful words with short reviews scheduled around your recall.">
      <SmartVocabularyRevision />
    </AppShell>
  );
}
