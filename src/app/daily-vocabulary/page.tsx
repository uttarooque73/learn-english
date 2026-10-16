import { AppShell } from "@/components/app-shell";
import { DailyVocabulary } from "@/components/daily-vocabulary";

export default function DailyVocabularyPage() {
  return <AppShell activePage="daily-vocabulary" title="Daily vocabulary" subtitle="Build a lasting vocabulary habit, one practical word at a time."><DailyVocabulary /></AppShell>;
}
