import { describe, expect, it } from "vitest";
import { buildAchievementCards, type AchievementStats } from "@/lib/learning-achievements";

const emptyStats: AchievementStats = {
  completedSessions: 0,
  practiceMinutes: 0,
  longestStreak: 0,
  currentStreak: 0,
  uniqueVocabularyReviewed: 0,
  totalVocabularyReviews: 0,
  highScoringAssessments: 0,
  grammarAssessments: 0,
  completedPlans: 0,
  resolvedMistakes: 0,
  masteredSkills: 0,
};

describe("learning achievements", () => {
  it("starts milestones locked and reports zero progress", () => {
    const cards = buildAchievementCards(emptyStats);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => !card.unlocked && card.progress === 0 && card.progressPercent === 0)).toBe(true);
  });

  it("unlocks milestones at their actual evidence thresholds", () => {
    const cards = buildAchievementCards({
      ...emptyStats,
      completedSessions: 5,
      practiceMinutes: 65,
      longestStreak: 3,
      grammarAssessments: 1,
    });
    expect(cards.find((card) => card.key === "first-session")?.unlocked).toBe(true);
    expect(cards.find((card) => card.key === "five-sessions")?.unlocked).toBe(true);
    expect(cards.find((card) => card.key === "hour-of-practice")?.unlocked).toBe(true);
    expect(cards.find((card) => card.key === "three-day-streak")?.unlocked).toBe(true);
    expect(cards.find((card) => card.key === "seven-day-streak")?.unlocked).toBe(false);
    expect(cards.find((card) => card.key === "grammar-explorer")?.unlocked).toBe(true);
  });

  it("clamps progress and preserves previously earned achievements", () => {
    const cards = buildAchievementCards(
      { ...emptyStats, completedSessions: 12 },
      new Map([["skill-builder", "2026-10-01T10:00:00.000Z"]]),
    );
    expect(cards.find((card) => card.key === "five-sessions")).toMatchObject({ progress: 5, progressPercent: 100, unlocked: true });
    expect(cards.find((card) => card.key === "skill-builder")).toMatchObject({ unlocked: true, earnedAt: "2026-10-01T10:00:00.000Z" });
  });
});
