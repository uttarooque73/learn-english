import { describe, expect, it } from "vitest";
import { diagnoseLearningContext } from "@/lib/ai/multi-agent-learning";

describe("diagnoseLearningContext", () => {
  it("uses balanced defaults when evidence is missing", () => {
    const result = diagnoseLearningContext({ proficiencyLevel: "beginner", dailyTargetMinutes: 15, skills: [], mistakes: [], dueVocabularyReviews: 0, recentScores: [] });
    expect(result.focusSkills).toEqual(["speaking", "vocabulary"]);
    expect(result.confidence).toBe("low");
  });

  it("prioritizes skills with low mastery and sufficient evidence", () => {
    const result = diagnoseLearningContext({
      proficiencyLevel: "intermediate",
      dailyTargetMinutes: 20,
      skills: [
        { skillKey: "grammar", mastery: 0.42, confidence: 0.8, evidenceCount: 5 },
        { skillKey: "speaking", mastery: 0.9, confidence: 0.9, evidenceCount: 10 },
      ],
      mistakes: [],
      dueVocabularyReviews: 0,
      recentScores: [0.5],
    });

    expect(result.focusSkills).toContain("grammar");
    expect(result.focusSkills).not.toContain("speaking");
    expect(result.reasons).toContain("grammar has a saved mastery estimate of 42%.");
  });

  it("adds vocabulary to the focus when reviews are due", () => {
    const result = diagnoseLearningContext({
      proficiencyLevel: "beginner",
      dailyTargetMinutes: 15,
      skills: [],
      mistakes: [],
      dueVocabularyReviews: 4,
      recentScores: [],
    });

    expect(result.focusSkills).toContain("vocabulary");
    expect(result.dueVocabularyReviews).toBe(4);
    expect(result.reasons[0]).toBe("4 vocabulary review(s) are due.");
  });

  it("includes recurring mistake categories in the focus", () => {
    const result = diagnoseLearningContext({
      proficiencyLevel: "intermediate",
      dailyTargetMinutes: 15,
      skills: [],
      mistakes: [{ category: "verb-tense", normalizedKey: "went yesterday", occurrenceCount: 3 }],
      dueVocabularyReviews: 0,
      recentScores: [],
    });

    expect(result.focusSkills).toContain("verb-tense");
    expect(result.reasons).toContain("Recurring verb-tense issue observed 3 times.");
  });
});
