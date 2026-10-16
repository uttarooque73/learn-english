import { describe, expect, it } from "vitest";
import type { PracticeSession, SavedVocabulary } from "@/lib/learning-storage";
import { getLearningAnalytics } from "@/lib/learning-analytics";

function sessionOn(date: Date, options: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: options.id ?? date.toISOString(),
    scenario: "Daily stand-up",
    startedAt: date.toISOString(),
    updatedAt: date.toISOString(),
    durationSeconds: options.durationSeconds ?? 600,
    messageCount: options.messageCount ?? 2,
    learnerMessages: [],
    ...options,
  };
}

function dayAt(now: Date, offset: number) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  date.setDate(date.getDate() + offset);
  return date;
}

describe("learning analytics", () => {
  it("calculates current and longest streaks without counting duplicate sessions as extra days", () => {
    const now = new Date(2026, 9, 17, 12);
    const sessions = [
      sessionOn(dayAt(now, 0), { id: "today-1" }),
      sessionOn(dayAt(now, 0), { id: "today-2" }),
      sessionOn(dayAt(now, -1), { id: "yesterday" }),
      sessionOn(dayAt(now, -2), { id: "two-days-ago" }),
      sessionOn(dayAt(now, -5), { id: "older-day" }),
    ];

    const analytics = getLearningAnalytics(sessions, [], now);
    expect(analytics.currentStreak).toBe(3);
    expect(analytics.longestStreak).toBe(3);
    expect(analytics.recentActivity).toHaveLength(7);
    expect(analytics.recentActivity[6]?.sessions).toBe(2);
  });

  it("keeps yesterday's streak alive but resets after a missed day", () => {
    const now = new Date(2026, 9, 17, 12);
    expect(getLearningAnalytics([sessionOn(dayAt(now, -1))], [], now).currentStreak).toBe(1);
    expect(getLearningAnalytics([sessionOn(dayAt(now, -2))], [], now).currentStreak).toBe(0);
  });

  it("aggregates weekly and monthly totals, vocabulary reviews, and repeated corrections", () => {
    const now = new Date(2026, 9, 17, 12);
    const summary = {
      topicSummary: "Work practice",
      keyPoints: [],
      corrections: [{ original: "I am work here.", improved: "I work here.", reason: "Verb form" }],
      vocabulary: [],
      strengths: [],
      improvements: [],
      followUpExercise: "Try again",
    };
    const sessions = [
      sessionOn(dayAt(now, 0), { id: "one", durationSeconds: 900, summary }),
      sessionOn(dayAt(now, -1), { id: "two", durationSeconds: 1800, summary }),
      sessionOn(new Date(2026, 8, 20, 12), { id: "last-month", durationSeconds: 1200 }),
    ];
    const words: SavedVocabulary[] = [
      { id: "one", phrase: "follow up", meaning: "continue", example: "I'll follow up", savedAt: now.toISOString(), reviewCount: 2, status: "familiar" },
      { id: "two", phrase: "clear up", meaning: "explain", example: "Let me clear this up", savedAt: now.toISOString(), reviewCount: 1, status: "mastered" },
      { id: "three", phrase: "circle back", meaning: "return", example: "Let's circle back", savedAt: now.toISOString(), status: "learning" },
    ];

    const analytics = getLearningAnalytics(sessions, words, now);
    expect(analytics.sessionsThisWeek).toBe(2);
    expect(analytics.minutesThisWeek).toBe(45);
    expect(analytics.sessionsThisMonth).toBe(2);
    expect(analytics.minutesThisMonth).toBe(45);
    expect(analytics.practiceDaysThisWeek).toBe(2);
    expect(analytics.totalReviews).toBe(3);
    expect(analytics.reviewedVocabularyCount).toBe(2);
    expect(analytics.masteredVocabularyCount).toBe(1);
    expect(analytics.commonCorrections[0]).toMatchObject({ original: "I am work here.", improved: "I work here.", count: 2 });
  });

  it("ignores invalid timestamps and empty correction text", () => {
    const now = new Date(2026, 9, 17, 12);
    const invalid = sessionOn(now, { id: "invalid", startedAt: "not-a-date" });
    const summary = { topicSummary: "", keyPoints: [], corrections: [{ original: " ", improved: "fine", reason: "" }], vocabulary: [], strengths: [], improvements: [], followUpExercise: "" };
    const analytics = getLearningAnalytics([invalid, sessionOn(now, { summary })], [], now);
    expect(analytics.sessionsThisWeek).toBe(1);
    expect(analytics.commonCorrections).toEqual([]);
  });
});
