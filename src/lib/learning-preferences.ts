export type EnglishLevel = "Beginner" | "Intermediate" | "Advanced";
export type FeedbackStyle = "gentle" | "balanced" | "detailed";
export type FeedbackTiming = "immediate" | "end";
export type SpeechRate = 0.8 | 1 | 1.2;

export type LearningPreferences = {
  englishLevel: EnglishLevel;
  dailyGoalMinutes: number;
  feedbackStyle: FeedbackStyle;
  feedbackTiming: FeedbackTiming;
  speechRate: SpeechRate;
  speechVoiceURI: string;
  preferredTopics: string[];
  largerText: boolean;
  reducedMotion: boolean;
};

export const DEFAULT_LEARNING_PREFERENCES: LearningPreferences = {
  englishLevel: "Beginner",
  dailyGoalMinutes: 10,
  feedbackStyle: "balanced",
  feedbackTiming: "end",
  speechRate: 1,
  speechVoiceURI: "",
  preferredTopics: ["Everyday life", "At work"],
  largerText: false,
  reducedMotion: false,
};

export const LEARNING_TOPICS = [
  "Everyday life",
  "At work",
  "Job interview",
  "Daily stand-up",
  "Team meeting",
  "Explain a technical concept",
  "Restaurant conversation",
  "Travel and directions",
  "Phone call",
  "Free conversation",
] as const;

const PREFERENCES_KEY = "speakup:preferences:v1";

export function getLearningPreferences(): LearningPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_LEARNING_PREFERENCES };
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_LEARNING_PREFERENCES };
    const value = parsed as Record<string, unknown>;
    const levels: EnglishLevel[] = ["Beginner", "Intermediate", "Advanced"];
    const styles: FeedbackStyle[] = ["gentle", "balanced", "detailed"];
    const timings: FeedbackTiming[] = ["immediate", "end"];
    const speechRates: SpeechRate[] = [0.8, 1, 1.2];
    const goal = Number(value.dailyGoalMinutes);
    return {
      englishLevel: levels.includes(value.englishLevel as EnglishLevel) ? value.englishLevel as EnglishLevel : "Beginner",
      dailyGoalMinutes: [5, 10, 15, 20, 30].includes(goal) ? goal : 10,
      feedbackStyle: styles.includes(value.feedbackStyle as FeedbackStyle) ? value.feedbackStyle as FeedbackStyle : "balanced",
      feedbackTiming: timings.includes(value.feedbackTiming as FeedbackTiming) ? value.feedbackTiming as FeedbackTiming : "end",
      speechRate: speechRates.includes(value.speechRate as SpeechRate) ? value.speechRate as SpeechRate : 1,
      speechVoiceURI: typeof value.speechVoiceURI === "string" ? value.speechVoiceURI.slice(0, 300) : "",
      preferredTopics: Array.isArray(value.preferredTopics)
        ? value.preferredTopics.filter((topic): topic is string => typeof topic === "string" && (LEARNING_TOPICS as readonly string[]).includes(topic)).slice(0, 10)
        : [...DEFAULT_LEARNING_PREFERENCES.preferredTopics],
      largerText: value.largerText === true,
      reducedMotion: value.reducedMotion === true,
    };
  } catch {
    return { ...DEFAULT_LEARNING_PREFERENCES };
  }
}

export function saveLearningPreferences(preferences: LearningPreferences): void {
  if (typeof window === "undefined") return;
  const safe: LearningPreferences = {
    englishLevel: ["Beginner", "Intermediate", "Advanced"].includes(preferences.englishLevel) ? preferences.englishLevel : "Beginner",
    dailyGoalMinutes: [5, 10, 15, 20, 30].includes(preferences.dailyGoalMinutes) ? preferences.dailyGoalMinutes : 10,
    feedbackStyle: ["gentle", "balanced", "detailed"].includes(preferences.feedbackStyle) ? preferences.feedbackStyle : "balanced",
    feedbackTiming: ["immediate", "end"].includes(preferences.feedbackTiming) ? preferences.feedbackTiming : "end",
    speechRate: [0.8, 1, 1.2].includes(preferences.speechRate) ? preferences.speechRate : 1,
    speechVoiceURI: typeof preferences.speechVoiceURI === "string" ? preferences.speechVoiceURI.slice(0, 300) : "",
    preferredTopics: preferences.preferredTopics.filter((topic) => (LEARNING_TOPICS as readonly string[]).includes(topic)).slice(0, 10),
    largerText: Boolean(preferences.largerText),
    reducedMotion: Boolean(preferences.reducedMotion),
  };
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(safe));
}

export function applyAccessibilityPreferences(preferences: LearningPreferences): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("speakup-larger-text", preferences.largerText);
  document.documentElement.classList.toggle("speakup-reduced-motion", preferences.reducedMotion);
}
