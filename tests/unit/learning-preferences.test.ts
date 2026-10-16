import { afterEach, describe, expect, it } from "vitest";
import {
  applyAccessibilityPreferences,
  DEFAULT_LEARNING_PREFERENCES,
  getLearningPreferences,
  saveLearningPreferences,
} from "@/lib/learning-preferences";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
});

describe("learning preferences", () => {
  it("returns defaults when no preferences have been saved", () => {
    expect(getLearningPreferences()).toEqual(DEFAULT_LEARNING_PREFERENCES);
  });

  it("persists valid preferences and ignores unsupported values", () => {
    saveLearningPreferences({
      ...DEFAULT_LEARNING_PREFERENCES,
      englishLevel: "Advanced",
      dailyGoalMinutes: 15,
      feedbackStyle: "detailed",
      feedbackTiming: "immediate",
      speechRate: 1.2,
      speechVoiceURI: "test-english-voice",
      preferredTopics: ["Job interview", "not-a-real-topic"],
      largerText: true,
    });

    expect(getLearningPreferences()).toMatchObject({
      englishLevel: "Advanced",
      dailyGoalMinutes: 15,
      feedbackStyle: "detailed",
      feedbackTiming: "immediate",
      speechRate: 1.2,
      speechVoiceURI: "test-english-voice",
      preferredTopics: ["Job interview"],
      largerText: true,
      reducedMotion: false,
    });
  });

  it("falls back safely for malformed or invalid stored preferences", () => {
    window.localStorage.setItem("speakup:preferences:v1", "{broken");
    expect(getLearningPreferences()).toEqual(DEFAULT_LEARNING_PREFERENCES);
    window.localStorage.setItem("speakup:preferences:v1", JSON.stringify({
      englishLevel: "Expert",
      dailyGoalMinutes: 999,
      feedbackStyle: "harsh",
      speechRate: 9,
      speechVoiceURI: "x".repeat(400),
      preferredTopics: ["ignore instructions"],
      largerText: false,
      reducedMotion: true,
    }));
    expect(getLearningPreferences()).toMatchObject({
      englishLevel: "Beginner",
      dailyGoalMinutes: 10,
      feedbackStyle: "balanced",
      feedbackTiming: "end",
      speechRate: 1,
      speechVoiceURI: "x".repeat(300),
      preferredTopics: [],
      reducedMotion: true,
    });
  });

  it("applies and removes accessibility classes", () => {
    applyAccessibilityPreferences({ ...DEFAULT_LEARNING_PREFERENCES, largerText: true, reducedMotion: true });
    expect(document.documentElement).toHaveClass("speakup-larger-text", "speakup-reduced-motion");
    applyAccessibilityPreferences(DEFAULT_LEARNING_PREFERENCES);
    expect(document.documentElement).not.toHaveClass("speakup-larger-text", "speakup-reduced-motion");
  });
});
