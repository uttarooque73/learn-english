import { describe, expect, it } from "vitest";
import { validateEvaluation } from "@/app/api/conversation-coach/turn/route";

describe("conversation session evaluator output", () => {
  it("accepts a bounded score and useful, sanitized feedback", () => {
    expect(validateEvaluation({
      score: 0.76,
      feedback: "Your answer is clear; add one concrete detail.",
      strengths: ["Clear main point", "Relevant example", 42, "  "],
    })).toEqual({
      score: 0.76,
      feedback: "Your answer is clear; add one concrete detail.",
      strengths: ["Clear main point", "Relevant example"],
    });
  });

  it.each([-0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY, "0.8"])(
    "rejects an invalid evaluation score: %s",
    (score) => {
      expect(validateEvaluation({ score, feedback: "Keep practising.", strengths: [] })).toBeNull();
    },
  );

  it("rejects missing feedback and bounds long model output", () => {
    expect(validateEvaluation({ score: 0.5, strengths: [] })).toBeNull();
    const result = validateEvaluation({
      score: 0.5,
      feedback: "Useful next step. ".repeat(100),
      strengths: Array.from({ length: 8 }, (_, index) => `Strength ${index}`),
    });
    expect(result?.feedback.length).toBeLessThanOrEqual(600);
    expect(result?.strengths).toHaveLength(3);
  });
});
