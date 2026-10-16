"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  applyAccessibilityPreferences,
  DEFAULT_LEARNING_PREFERENCES,
  getLearningPreferences,
  LEARNING_TOPICS,
  saveLearningPreferences,
  type LearningPreferences,
} from "@/lib/learning-preferences";

export function LearningSettings() {
  const [preferences, setPreferences] = useState<LearningPreferences>(DEFAULT_LEARNING_PREFERENCES);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = getLearningPreferences();
      setPreferences(current);
      applyAccessibilityPreferences(current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function update<K extends keyof LearningPreferences>(key: K, value: LearningPreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function toggleTopic(topic: string, checked: boolean) {
    const next = checked
      ? [...preferences.preferredTopics, topic]
      : preferences.preferredTopics.filter((item) => item !== topic);
    update("preferredTopics", next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveLearningPreferences(preferences);
    applyAccessibilityPreferences(preferences);
    setSaved(true);
  }

  return (
    <form className="learning-settings" onSubmit={handleSubmit}>
      <section className="settings-card" aria-labelledby="learning-style-heading">
        <div className="settings-card-heading"><span className="settings-symbol" aria-hidden="true">Aa</span><div><h2 id="learning-style-heading">Your learning style</h2><p>Choose a level and feedback approach that feels right for you.</p></div></div>
        <div className="settings-field-grid">
          <label className="settings-field">Current English level
            <select value={preferences.englishLevel} onChange={(event) => update("englishLevel", event.target.value as LearningPreferences["englishLevel"])}>
              <option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option>
            </select>
            <span>Used to adapt your AI conversation practice.</span>
          </label>
          <label className="settings-field">Feedback style
            <select value={preferences.feedbackStyle} onChange={(event) => update("feedbackStyle", event.target.value as LearningPreferences["feedbackStyle"])}>
              <option value="gentle">Gentle — encouragement first</option><option value="balanced">Balanced — tips and corrections</option><option value="detailed">Detailed — explain corrections</option>
            </select>
            <span>Controls how the AI coach responds when you ask for help.</span>
          </label>
          <label className="settings-field">Daily practice goal
            <select value={String(preferences.dailyGoalMinutes)} onChange={(event) => update("dailyGoalMinutes", Number(event.target.value))}>
              {[5, 10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes a day</option>)}
            </select>
            <span>A flexible target, not a performance score.</span>
          </label>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="topics-heading">
        <div className="settings-card-heading"><span className="settings-symbol" aria-hidden="true">✦</span><div><h2 id="topics-heading">Topics you want to practice</h2><p>Select the situations you care about. You can change these any time.</p></div></div>
        <fieldset className="settings-topic-grid"><legend className="visually-hidden">Preferred practice topics</legend>
          {LEARNING_TOPICS.map((topic) => <label className="settings-topic" key={topic}><input type="checkbox" checked={preferences.preferredTopics.includes(topic)} onChange={(event) => toggleTopic(topic, event.target.checked)} /><span>{topic}</span></label>)}
        </fieldset>
      </section>

      <section className="settings-card" aria-labelledby="accessibility-heading">
        <div className="settings-card-heading"><span className="settings-symbol" aria-hidden="true">◉</span><div><h2 id="accessibility-heading">Comfort & accessibility</h2><p>Adjust the interface for easier reading and calmer motion.</p></div></div>
        <label className="settings-toggle"><span><strong>Larger text</strong><small>Increase text size across the app.</small></span><input type="checkbox" checked={preferences.largerText} onChange={(event) => update("largerText", event.target.checked)} /></label>
        <label className="settings-toggle"><span><strong>Reduce animation</strong><small>Minimize transitions and animated effects.</small></span><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => update("reducedMotion", event.target.checked)} /></label>
      </section>

      <div className="settings-submit-row"><p aria-live="polite" role="status">{saved ? "Your preferences are saved on this device." : "Preferences stay in this browser and are not sent to an account."}</p><button className="button button-dark" type="submit">Save preferences <span aria-hidden="true">✓</span></button></div>
    </form>
  );
}
