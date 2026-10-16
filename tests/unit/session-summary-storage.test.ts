import { beforeEach, describe, expect, it } from "vitest";
import { getSessions, upsertSession, type SessionSummary } from "@/lib/learning-storage";

const summary: SessionSummary = {
  topicSummary: "Practised explaining a project.",
  keyPoints: ["Explained the goal"],
  corrections: [{ original: "I am work on it.", improved: "I am working on it.", reason: "Use the present continuous." }],
  vocabulary: [{ phrase: "project scope", meaning: "The work a project includes." }],
  strengths: ["Clear example"],
  improvements: ["Add a result"],
  followUpExercise: "Explain the outcome in two sentences.",
};

describe("session summary persistence", () => {
  beforeEach(() => localStorage.clear());

  it("stores a summary with its conversation and returns it from history", () => {
    upsertSession({
      id: "session-with-summary",
      scenario: "Team meeting",
      startedAt: "2026-10-16T10:00:00.000Z",
      updatedAt: "2026-10-16T10:05:00.000Z",
      durationSeconds: 300,
      messageCount: 2,
      learnerMessages: ["I am work on it."],
      messages: [{ role: "user", content: "I am work on it." }, { role: "assistant", content: "What is the project about?" }],
      summary,
    });

    expect(getSessions()[0].summary).toEqual(summary);
    expect(getSessions()[0].messages).toHaveLength(2);
  });

  it("continues to read older sessions without a summary", () => {
    upsertSession({
      id: "legacy-session",
      scenario: "Daily stand-up",
      startedAt: "2026-10-15T10:00:00.000Z",
      updatedAt: "2026-10-15T10:01:00.000Z",
      durationSeconds: 60,
      messageCount: 1,
      learnerMessages: ["Yesterday I fixed a bug."],
    });

    expect(getSessions()[0].summary).toBeUndefined();
    expect(getSessions()[0].scenario).toBe("Daily stand-up");
  });
});
