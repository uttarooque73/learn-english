import { describe, expect, it } from "vitest";
import { buildLearningCalendar, localDateKey } from "@/lib/learning-calendar";

describe("learning activity calendar", () => {
  it("builds a leap-year month and aggregates saved activity", () => {
    const calendar = buildLearningCalendar("2024-02", "UTC", [
      { date: "2024-02-01", kind: "practice", durationSeconds: 1200 },
      { date: "2024-02-01", kind: "practice", durationSeconds: 1800 },
      { date: "2024-02-01", kind: "vocabulary" },
      { date: "2024-02-03", kind: "assessment", score: 0.9 },
    ], new Date("2024-02-03T12:00:00Z"));

    expect(calendar.daysInMonth).toBe(29);
    expect(calendar.startOffset).toBe(4);
    expect(calendar.monthLabel).toBe("February 2024");
    expect(calendar.summary).toEqual({
      activeDays: 2,
      practiceSessions: 2,
      practiceMinutes: 50,
      vocabularyReviews: 1,
      assessments: 1,
    });
    expect(calendar.days.find((day) => day.date === "2024-02-01")).toMatchObject({
      practiceSessions: 2,
      practiceMinutes: 50,
      vocabularyReviews: 1,
      totalActivities: 3,
      activityLevel: 2,
    });
  });

  it("computes consecutive practice streaks across month boundaries", () => {
    const calendar = buildLearningCalendar("2024-03", "UTC", [
      { date: "2024-02-28", kind: "practice", durationSeconds: 600 },
      { date: "2024-02-29", kind: "practice", durationSeconds: 600 },
      { date: "2024-03-01", kind: "practice", durationSeconds: 600 },
      { date: "2024-03-02", kind: "practice", durationSeconds: 600 },
    ], new Date("2024-03-02T12:00:00Z"));

    expect(calendar.longestStreak).toBe(4);
    expect(calendar.currentStreak).toBe(4);
    expect(calendar.summary.practiceSessions).toBe(2);
  });

  it("uses the learner timezone when mapping timestamps to days", () => {
    expect(localDateKey("2026-10-01T20:30:00.000Z", "Asia/Kolkata")).toBe("2026-10-02");
    expect(localDateKey("not-a-date", "UTC")).toBeNull();
  });

  it("rejects malformed month keys", () => {
    expect(() => buildLearningCalendar("2024-13", "UTC", [])).toThrow("YYYY-MM");
  });
});
