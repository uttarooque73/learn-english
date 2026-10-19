import { describe, expect, it } from "vitest";
import { chooseLearningAgent } from "@/lib/ai/learning-agent-router";

describe("chooseLearningAgent", () => {
  it("routes explicit grammar questions to the grammar specialist", () => {
    expect(chooseLearningAgent({ message: "Why is this tense wrong?", mode: "tutor" }).id).toBe("grammar");
  });

  it("routes word meaning requests to the vocabulary specialist", () => {
    expect(chooseLearningAgent({ message: "What is the meaning of resilient?", mode: "tutor" }).id).toBe("vocabulary");
  });

  it("routes pronunciation requests to the pronunciation specialist", () => {
    expect(chooseLearningAgent({ message: "How do I pronounce comfortable?", mode: "tutor" }).id).toBe("pronunciation");
  });

  it("prioritizes a selected interview scenario", () => {
    expect(chooseLearningAgent({ message: "Correct my grammar please", mode: "conversation", scenario: "Job interview" }).id).toBe("interview");
  });

  it("routes writing generation to the writing specialist", () => {
    expect(chooseLearningAgent({ message: "Write a paragraph about my city", mode: "paragraph-generation" }).id).toBe("writing");
  });

  it("falls back to a tutor for general tutor requests", () => {
    expect(chooseLearningAgent({ message: "Can you help me learn?", mode: "tutor" }).id).toBe("tutor");
  });

  it("uses the conversation partner for open conversation", () => {
    expect(chooseLearningAgent({ message: "I went to the park yesterday", mode: "conversation" }).id).toBe("conversation");
  });
});
