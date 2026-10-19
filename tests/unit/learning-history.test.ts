import { describe, expect, it } from "vitest";
import { buildLearningHistory } from "@/lib/learning-history";

describe("learning history", () => {
  it("normalizes and sorts saved activity from multiple learning sources", () => {
    const items = buildLearningHistory(
      [{
        id: "p1", activityType: "conversation-coach", resultJson: JSON.stringify({
          summary: "Practiced talking about my work.",
          score: 0.9,
          corrections: [{ original: "I go yesterday", improved: "I went yesterday" }],
        }),
        durationSeconds: 125, createdAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:02:00.000Z",
      }],
      [{
        id: "a1", skillKey: "grammar", score: 0.86,
        evidenceJson: JSON.stringify([{ explanation: "Review past-tense verbs." }]),
        createdAt: "2026-10-02T10:00:00.000Z",
      }],
      [{
        id: "v1", vocabularyRef: "take responsibility", recallRating: 4,
        intervalDays: 3, nextDueAt: "2026-10-05T10:00:00.000Z", createdAt: "2026-10-03T10:00:00.000Z",
      }],
    );

    expect(items.map((item) => item.kind)).toEqual(["vocabulary", "assessment", "practice"]);
    expect(items[2]).toMatchObject({
      title: "Conversation practice",
      description: "Practiced talking about my work.",
      href: "/conversation-coach",
      durationMinutes: 2,
      scorePercent: 90,
    });
    expect(items[2].details).toContain("Try “I went yesterday” instead of “I go yesterday”.");
    expect(items[1].scorePercent).toBe(86);
    expect(items[1].details).toContain("Review past-tense verbs.");
  });

  it("uses safe default titles and routes for unknown activity types", () => {
    const items = buildLearningHistory(
      [{ id: "x", activityType: "custom_activity", resultJson: "not json", durationSeconds: -10, createdAt: "2026-10-01T00:00:00Z", completedAt: null }],
      [],
      [],
    );
    expect(items[0]).toMatchObject({
      title: "Custom Activity",
      href: "/practice",
      durationMinutes: 0,
      description: "Your completed practice session was saved.",
    });
  });

  it("discards records with invalid timestamps and limits the feed", () => {
    const items = buildLearningHistory(
      Array.from({ length: 205 }, (_, index) => ({
        id: String(index), activityType: "speaking", resultJson: "{}", durationSeconds: 60,
        createdAt: "2026-10-01T00:00:00Z", completedAt: "2026-10-01T00:00:00Z",
      })).concat([{
        id: "invalid", activityType: "speaking", resultJson: "{}", durationSeconds: 60,
        createdAt: "bad", completedAt: "bad",
      }]),
      [],
      [],
    );
    expect(items).toHaveLength(200);
    expect(items.every((item) => Number.isFinite(Date.parse(item.occurredAt)))).toBe(true);
  });
});
