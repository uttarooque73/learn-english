import { AppShell } from "@/components/app-shell";
import { LearningSettings } from "@/components/learning-settings";

export default function SettingsPage() {
  return (
    <AppShell activePage="settings" title="Learning preferences" subtitle="Make SpeakUp fit your goals, your interests, and your comfort.">
      <section className="settings-intro">
        <p className="eyebrow">YOUR SPACE, YOUR RULES</p>
        <h2>A learning plan that feels like yours.</h2>
        <p>Set a daily target, choose the conversations that matter, and tune how the coach gives feedback. These settings are saved locally on this device.</p>
      </section>
      <LearningSettings />
    </AppShell>
  );
}
