import { AppShell } from "@/components/app-shell";
import { LearningSettings } from "@/components/learning-settings";
import { LearningRoutineControls } from "@/components/learning-routine-controls";

export default function SettingsPage() {
  return (
    <AppShell activePage="settings" title="Learning preferences" subtitle="Make SpeakUp fit your goals, your interests, and your comfort.">
      <section className="settings-intro">
        <p className="eyebrow">YOUR SPACE, YOUR RULES</p>
        <h2>A learning plan that feels like yours.</h2>
        <p>Set your learning style and preferences, then configure the database-backed daily schedule and evidence-based adaptation policy.</p>
      </section>
      <LearningRoutineControls />
      <LearningSettings />
    </AppShell>
  );
}
