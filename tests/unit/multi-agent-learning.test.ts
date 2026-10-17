import { describe, expect, it } from "vitest";
import { diagnoseLearningContext } from "@/lib/ai/multi-agent-learning";

describe("diagnoseLearningContext", () => {
  it("uses balanced defaults when evidence is missing", () => {
    const result = diagnoseLearningContext({ proficiencyLevel: "beginner", dailyTargetMinutes: 15, skills: [], mistakes: [], dueVocabularyReviews: 0, recentScores: [] });
    expect(result.focusSkills).toEqual(["speaking", "vocabulary"]);
    expect(result.confidence).toBe("low");
  });
});
