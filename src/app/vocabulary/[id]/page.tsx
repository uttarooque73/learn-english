import { AppShell } from "@/components/app-shell";
import { VocabularyDetail } from "@/components/vocabulary-detail";

export default async function VocabularyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell activePage="vocabulary" title="Word details" subtitle="Understand it, see it in context, and make it part of your everyday English.">
      <VocabularyDetail id={decodeURIComponent(id)} />
    </AppShell>
  );
}
