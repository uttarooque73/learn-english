import { readPersistedValue, writePersistedValue } from "@/lib/client-persistence";

export type LearningScenario = { id: string; title: string; description: string; icon: string; tone: string; custom?: boolean };

export const DEFAULT_SCENARIOS: LearningScenario[] = [
  { id: "everyday-life", title: "Everyday life", description: "Talk about routines, hobbies, and everyday plans.", icon: "☕", tone: "peach" },
  { id: "job-interview", title: "Job interview", description: "Practice interview questions and confident answers.", icon: "✦", tone: "mint" },
  { id: "daily-stand-up", title: "Daily stand-up", description: "Share yesterday's work, today's plan, and blockers.", icon: "↗", tone: "lavender" },
  { id: "team-meeting", title: "Team meeting", description: "Share ideas, agree politely, and clarify decisions.", icon: "◎", tone: "blue" },
  { id: "technical-concept", title: "Explain a technical concept", description: "Explain software topics clearly and answer follow-ups.", icon: "⌘", tone: "lavender" },
  { id: "restaurant", title: "Restaurant conversation", description: "Order a meal, ask about options, and request the bill.", icon: "♨", tone: "peach" },
  { id: "travel", title: "Travel and directions", description: "Ask for directions, tickets, and travel information.", icon: "↗", tone: "blue" },
  { id: "phone-call", title: "Phone call", description: "Practice introductions, requests, and polite call endings.", icon: "☎", tone: "mint" },
  { id: "free-conversation", title: "Free conversation", description: "Choose any subject and speak naturally.", icon: "◎", tone: "blue" },
];
const STORAGE_KEY = "speakup:custom-scenarios:v1";
const TONES = ["peach", "mint", "lavender", "blue"];
const ICONS = ["✦", "☕", "💼", "🎯", "🌍", "☎", "◎", "↗", "⌘", "♨"];

export function getLearningScenarios(): LearningScenario[] {
  if (typeof window === "undefined") return DEFAULT_SCENARIOS;
  try {
    const saved: unknown = JSON.parse(readPersistedValue(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(saved)) return DEFAULT_SCENARIOS;
    const valid = saved.filter((item): item is LearningScenario =>
      Boolean(item && typeof item.id === "string" && typeof item.title === "string" &&
      typeof item.description === "string" && typeof item.icon === "string" &&
      typeof item.tone === "string" && item.custom === true)
    );
    return [...DEFAULT_SCENARIOS, ...valid];
  } catch { return DEFAULT_SCENARIOS; }
}

export function addLearningScenario(title: string, description: string, icon = "✦"): LearningScenario {
  const current = getLearningScenarios().filter((item) => item.custom);
  const cleanTitle = title.trim().slice(0, 60);
  const cleanDescription = description.trim().slice(0, 180);
  if (!cleanTitle || !cleanDescription) throw new Error("Add a title and a short description.");
  if (getLearningScenarios().some((item) => item.title.toLocaleLowerCase() === cleanTitle.toLocaleLowerCase())) {
    throw new Error("An option with this title already exists.");
  }
  if (current.length >= 50) throw new Error("You can add up to 50 custom options.");
  const scenario: LearningScenario = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: cleanTitle, description: cleanDescription, icon: ICONS.includes(icon) ? icon : "✦",
    tone: TONES[current.length % TONES.length], custom: true,
  };
  writePersistedValue(STORAGE_KEY, JSON.stringify([...current, scenario]));
  return scenario;
}

export function removeLearningScenario(id: string): void {
  const current = getLearningScenarios().filter((item) => item.custom && item.id !== id);
  writePersistedValue(STORAGE_KEY, JSON.stringify(current));
}
