"use client";

import { useEffect, useState, type FormEvent } from "react";
import { clearSavedPracticeData, getSessions, getVocabulary } from "@/lib/learning-storage";
import { LearningOptionsManager } from "@/components/learning-options-manager";
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
  const [savedDataCounts, setSavedDataCounts] = useState({ sessions: 0, vocabulary: 0 });
  const [dataStatus, setDataStatus] = useState("");
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechPlaybackSupported, setSpeechPlaybackSupported] = useState(false);

  useEffect(() => {
    let voiceChangeHandler: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const current = getLearningPreferences();
      setPreferences(current);
      setSavedDataCounts({ sessions: getSessions().length, vocabulary: getVocabulary().length });
      applyAccessibilityPreferences(current);
      if ("speechSynthesis" in window) {
        setSpeechPlaybackSupported(true);
        voiceChangeHandler = () => setSpeechVoices(window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en")));
        voiceChangeHandler();
        window.speechSynthesis.addEventListener("voiceschanged", voiceChangeHandler);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (voiceChangeHandler && "speechSynthesis" in window) window.speechSynthesis.removeEventListener("voiceschanged", voiceChangeHandler);
    };
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

  function handleClearSavedData() {
    if (savedDataCounts.sessions === 0 && savedDataCounts.vocabulary === 0) {
      setDataStatus("There is no saved practice data to delete.");
      return;
    }
    const confirmed = window.confirm("Permanently delete all saved conversations, transcripts, session summaries, and vocabulary from this browser? Learning preferences will be kept.");
    if (!confirmed) return;
    clearSavedPracticeData();
    setSavedDataCounts({ sessions: 0, vocabulary: 0 });
    setDataStatus("All saved conversations, summaries, and vocabulary have been deleted from this browser.");
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
          <label className="settings-field">Feedback timing
            <select value={preferences.feedbackTiming} onChange={(event) => update("feedbackTiming", event.target.value as LearningPreferences["feedbackTiming"])}>
              <option value="immediate">After every reply</option>
              <option value="end">At session review</option>
            </select>
            <span>Choose immediate corrections or review feedback when you finish practicing.</span>
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

      <LearningOptionsManager />

      <section className="settings-card" aria-labelledby="accessibility-heading">
        <div className="settings-card-heading"><span className="settings-symbol" aria-hidden="true">◉</span><div><h2 id="accessibility-heading">Comfort & accessibility</h2><p>Adjust the interface for easier reading and calmer motion.</p></div></div>
        <label className="settings-toggle"><span><strong>Larger text</strong><small>Increase text size across the app.</small></span><input type="checkbox" checked={preferences.largerText} onChange={(event) => update("largerText", event.target.checked)} /></label>
        <label className="settings-toggle"><span><strong>Reduce animation</strong><small>Minimize transitions and animated effects.</small></span><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => update("reducedMotion", event.target.checked)} /></label>
      </section>

      <section className="settings-card" aria-labelledby="speech-playback-heading">
        <div className="settings-card-heading"><span className="settings-symbol" aria-hidden="true">♫</span><div><h2 id="speech-playback-heading">Speech playback</h2><p>Choose how the coach reads example sentences and voice-session replies aloud.</p></div></div>
        <div className="settings-field-grid">
          <label className="settings-field">Speaking speed
            <select value={String(preferences.speechRate)} onChange={(event) => update("speechRate", Number(event.target.value) as LearningPreferences["speechRate"])}>
              <option value="0.8">Slow — clearer practice</option><option value="1">Normal</option><option value="1.2">Fast — natural pace</option>
            </select>
            <span>Changes text-to-speech playback where the browser supports it.</span>
          </label>
          <label className="settings-field">Voice style
            <select value={preferences.speechVoiceGender} onChange={(event) => {
              setPreferences((current) => ({ ...current, speechVoiceGender: event.target.value as LearningPreferences["speechVoiceGender"], speechVoiceURI: "" }));
              setSaved(false);
            }} disabled={!speechPlaybackSupported}>
              <option value="automatic">Automatic</option>
              <option value="female">Female voice</option>
              <option value="male">Male voice</option>
            </select>
            <span>Applies to vocabulary, examples, stories, practice conversations, and shadowing. Voice availability depends on your browser and device.</span>
          </label>
          <label className="settings-field">Specific English voice (optional)
            <select value={preferences.speechVoiceURI} onChange={(event) => {
              setPreferences((current) => ({ ...current, speechVoiceURI: event.target.value, speechVoiceGender: event.target.value ? "automatic" : current.speechVoiceGender }));
              setSaved(false);
            }} disabled={!speechPlaybackSupported}>
              <option value="">Use voice style above</option>
              {preferences.speechVoiceURI && !speechVoices.some((voice) => voice.voiceURI === preferences.speechVoiceURI) && <option value={preferences.speechVoiceURI}>Saved voice (not available on this device)</option>}
              {speechVoices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
            </select>
            <span>{speechPlaybackSupported ? speechVoices.length ? "Choosing a specific voice uses that voice and resets voice style to Automatic. Available choices vary by device." : "The browser has text-to-speech, but no English voices are currently available." : "Text-to-speech is not supported in this browser; playback controls will explain the fallback."}</span>
          </label>
        </div>
      </section>

      <section className="settings-card data-management-card" aria-labelledby="saved-data-heading">
        <div className="settings-card-heading"><span className="settings-symbol" aria-hidden="true">⌫</span><div><h2 id="saved-data-heading">Your saved learning data</h2><p>Review what is stored in this browser and remove it when you want.</p></div></div>
        <div className="saved-data-counts"><div><strong>{savedDataCounts.sessions}</strong><span>Saved conversations</span></div><div><strong>{savedDataCounts.vocabulary}</strong><span>Vocabulary items</span></div></div>
        <p className="data-management-note">Deleting saved practice data permanently removes conversation transcripts, session summaries, and vocabulary from this browser. Your learning preferences are kept. This action cannot be undone.</p>
        <button className="button button-danger-outline" type="button" onClick={handleClearSavedData}>Delete all saved practice data</button>
        <p className="data-management-status" aria-live="polite" role="status">{dataStatus}</p>
      </section>

      <div className="settings-submit-row"><p aria-live="polite" role="status">{saved ? "Your preferences are saved on this device." : "Preferences stay in this browser and are not sent to an account."}</p><button className="button button-dark" type="submit">Save preferences <span aria-hidden="true">✓</span></button></div>
    </form>
  );
}
