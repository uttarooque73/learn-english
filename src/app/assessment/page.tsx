import { AppShell } from "@/components/app-shell";
import { EnglishProficiencyAssessment } from "@/components/english-proficiency-assessment";

export default function AssessmentPage() {
  return (
    <AppShell activePage="assessment" title="English Proficiency Assessment" subtitle="Discover your current level and get a practical plan for what to improve next.">
      <EnglishProficiencyAssessment />
    </AppShell>
  );
}
