import { describe, expect, it, vi } from "vitest";
import {
  generateLearningActivity,
  isDynamicActivityType,
  isGeneratedLearningActivity,
  type GeneratedLearningActivity,
} from "@/lib/ai/activity-content";
import type { JsonValidator, ModelProvider } from "@/lib/ai/model-provider";

function providerReturning(value: unknown): ModelProvider {
  return {
    modelName: "test-model",
    generateText: vi.fn(async () => "unused"),
    generateJson: vi.fn(async <T,>(_prompt: string, validate: JsonValidator<T>): Promise<T> => {
      if (!validate(value)) throw new Error("Invalid fixture");
      return value as T;
    }) as unknown as ModelProvider["generateJson"],
  };
}

function activityFixture(count = 2): Omit<GeneratedLearningActivity, "activityType" | "model"> {
  return {
    title: "Everyday English",
    objective: "Practice clear everyday English.",
    instructions: "Read each prompt and answer aloud or in writing.",
    tip: "Use complete sentences when possible.",
    items: Array.from({ length: count }, (_, index) => ({
      prompt: `Question ${index + 1}?`,
      expectedAnswer: `Sample answer ${index + 1}.`,
      explanation: "This answer uses a natural sentence pattern.",
      options: [],
      example: "I use English every day.",
    })),
  };
}

describe("dynamic learning activity generator", () => {
  it("recognizes the supported activity types", () => {
    expect(isDynamicActivityType("grammar")).toBe(true);
    expect(isDynamicActivityType("real-world-challenge")).toBe(true);
    expect(isDynamicActivityType("unlisted")).toBe(false);
  });

  it("validates generated content before returning it", () => {
    expect(isGeneratedLearningActivity(activityFixture())).toBe(true);
    expect(isGeneratedLearningActivity({ ...activityFixture(), items: [] })).toBe(false);
    expect(isGeneratedLearningActivity({ ...activityFixture(), items: [{ prompt: "Only a prompt" }] })).toBe(false);
  });

  it("generates the requested number of personalized items", async () => {
    const provider = providerReturning(activityFixture(2));
    const result = await generateLearningActivity({
      activityType: "grammar",
      topic: "articles",
      proficiencyLevel: "beginner",
      quantity: 2,
      goal: "Use a, an, and the correctly",
    }, provider);

    expect(result).toMatchObject({
      activityType: "grammar",
      title: "Everyday English",
      model: "test-model",
    });
    expect(result.items).toHaveLength(2);
    const prompt = vi.mocked(provider.generateJson).mock.calls[0]?.[0] as string;
    expect(prompt).toContain("Topic: articles");
    expect(prompt).toContain("Proficiency level: beginner");
    expect(prompt).toContain("Generate exactly 2 items.");
  });

  it("rejects invalid quantities and proficiency levels before calling the model", async () => {
    const provider = providerReturning(activityFixture());
    await expect(generateLearningActivity({ activityType: "grammar", quantity: 0 }, provider))
      .rejects.toThrow("Quantity must be an integer between 1 and 10.");
    await expect(generateLearningActivity({ activityType: "grammar", proficiencyLevel: "expert-ish" }, provider))
      .rejects.toThrow("Choose a supported proficiency level.");
    expect(provider.generateJson).not.toHaveBeenCalled();
  });

  it("rejects a model response with a different item count", async () => {
    await expect(generateLearningActivity({
      activityType: "vocabulary",
      quantity: 3,
    }, providerReturning(activityFixture(2)))).rejects.toThrow("did not generate the requested number of items");
  });
});
