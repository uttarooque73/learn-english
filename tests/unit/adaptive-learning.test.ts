import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "@/lib/database";
import {
  AdaptiveLearningError,
  evaluatePracticeAttempt,
  generateDailyLearningPlan,
} from "@/lib/ai/adaptive-learning";
import {
  JsonValidator,
  ModelProvider,
  ModelProviderError,
} from "@/lib/ai/model-provider";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: { close(): void } };
const databaseGlobal = globalThis as DatabaseGlobal;
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

function setupDatabase() {
  previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-adaptive-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "test.sqlite");
}

function cleanupDatabase() {
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (previousDatabasePath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = previousDatabasePath;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
}

function providerReturning(value: unknown): ModelProvider {
  return {
    modelName: "test-model",
    generateText: vi.fn(async () => "unused"),
    generateJson: vi.fn(async <T,>(_prompt: string, validate: JsonValidator<T>): Promise<T> => {
      if (!validate(value)) throw new ModelProviderError("invalid_output", "Mock response failed validation.");
      return value;
    }),
  };
}

const samplePlan = {
  activities: [
    {
      activityType: "conversation",
      title: "Describe your morning",
      skillKey: "speaking",
      durationMinutes: 10,
      priority: 0.9,
      reason: "Practice the learner's stated speaking goal.",
    },
    {
      activityType: "vocabulary",
      title: "Review five useful words",
      skillKey: "vocabulary",
      durationMinutes: 5,
      priority: 0.7,
      reason: "Reinforce due vocabulary reviews.",
    },
  ],
};

const sampleEvaluation = {
  score: 0.8,
  confidence: 0.75,
  skillKey: "speaking",
  feedback: "Your meaning is clear. Focus on natural phrasing.",
  strengths: ["Clear meaning"],
  corrections: [
    { original: "I am agree", improved: "I agree", reason: "Agree is a verb and does not take 'am'." },
  ],
};

afterEach(cleanupDatabase);

describe("adaptive daily planner", () => {
  it("creates an owner-scoped plan within the configured time budget", async () => {
    setupDatabase();
    const provider = providerReturning(samplePlan);

    const plan = await generateDailyLearningPlan("owner-a", {
      dailyTargetMinutes: 20,
      goal: "Speak more confidently",
    }, provider);

    expect(plan.ownerId).toBe("owner-a");
    expect(plan.status).toBe("published");
    expect(plan.totalMinutes).toBe(15);
    expect(plan.items).toHaveLength(2);
    expect(plan.items[0]).toMatchObject({
      activityType: "conversation",
      title: "Describe your morning",
      durationMinutes: 10,
      status: "pending",
    });
    expect((await generateDailyLearningPlan("owner-a", { dailyTargetMinutes: 20 }, provider)).version).toBe(2);

    const ownerB = getDatabase().prepare(
      "SELECT COUNT(*) AS count FROM learning_plans WHERE owner_id = ?",
    ).get("owner-b") as { count: number };
    expect(ownerB.count).toBe(0);
  });

  it("rejects invalid model plans and plans that exceed the learner's time budget", async () => {
    setupDatabase();
    const tooLongPlan = {
      activities: [
        { ...samplePlan.activities[0], durationMinutes: 18 },
        { ...samplePlan.activities[1], durationMinutes: 5 },
      ],
    };

    await expect(generateDailyLearningPlan("owner-a", { dailyTargetMinutes: 20 }, providerReturning(tooLongPlan)))
      .rejects.toMatchObject({ code: "invalid_plan" });
    await expect(generateDailyLearningPlan("owner-a", { dailyTargetMinutes: 20 }, providerReturning({ activities: [] })))
      .rejects.toMatchObject({ code: "invalid_output" });

    const count = getDatabase().prepare("SELECT COUNT(*) AS count FROM learning_plans").get() as { count: number };
    expect(count.count).toBe(0);
  });

  it("rejects invalid time targets before calling the model", async () => {
    setupDatabase();
    const provider = providerReturning(samplePlan);

    await expect(generateDailyLearningPlan("owner-a", { dailyTargetMinutes: 0 }, provider))
      .rejects.toBeInstanceOf(AdaptiveLearningError);
    expect(provider.generateJson).not.toHaveBeenCalled();
  });
});

describe("practice evaluation and durable evidence", () => {
  it("saves an evaluation, updates skill evidence and recurring mistakes, and handles retries idempotently", async () => {
    setupDatabase();
    const plan = await generateDailyLearningPlan("owner-a", { dailyTargetMinutes: 20 }, providerReturning(samplePlan));
    const item = plan.items[0];
    const provider = providerReturning(sampleEvaluation);
    const request = {
      planItemId: item.id,
      responseText: "I am agree with you.",
      durationSeconds: 45,
      idempotencyKey: "attempt-key-001",
    };

    const first = await evaluatePracticeAttempt("owner-a", request, provider);
    expect(first.duplicate).toBe(false);
    expect(first.evaluation.score).toBe(0.8);

    const retry = await evaluatePracticeAttempt("owner-a", request, provider);
    expect(retry.duplicate).toBe(true);
    expect(retry.attemptId).toBe(first.attemptId);
    expect(provider.generateJson).toHaveBeenCalledTimes(1);

    const database = getDatabase();
    expect(database.prepare("SELECT COUNT(*) AS count FROM practice_attempts WHERE owner_id = 'owner-a'").get())
      .toEqual({ count: 1 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM skill_assessments WHERE owner_id = 'owner-a'").get())
      .toEqual({ count: 1 });
    expect(database.prepare("SELECT mastery, evidence_count FROM learner_skill_scores WHERE owner_id = 'owner-a' AND skill_key = 'speaking'").get())
      .toEqual({ mastery: 0.8, evidence_count: 1 });
    expect(database.prepare("SELECT normalized_key, occurrence_count FROM learning_mistakes WHERE owner_id = 'owner-a' AND status = 'active'").get())
      .toEqual({ normalized_key: "i am agree", occurrence_count: 1 });
    expect(database.prepare("SELECT status FROM learning_plan_items WHERE id = ? AND owner_id = 'owner-a'").get(item.id))
      .toEqual({ status: "completed" });
  });

  it("does not allow another learner to evaluate a plan item", async () => {
    setupDatabase();
    const plan = await generateDailyLearningPlan("owner-a", { dailyTargetMinutes: 20 }, providerReturning(samplePlan));

    await expect(evaluatePracticeAttempt("owner-b", {
      planItemId: plan.items[0].id,
      responseText: "My answer",
      durationSeconds: 10,
      idempotencyKey: "owner-b-attempt",
    }, providerReturning(sampleEvaluation))).rejects.toMatchObject({ code: "plan_not_found" });

    const count = getDatabase().prepare("SELECT COUNT(*) AS count FROM practice_attempts").get() as { count: number };
    expect(count.count).toBe(0);
  });

  it("does not persist evidence when the evaluator returns the wrong skill", async () => {
    setupDatabase();
    const plan = await generateDailyLearningPlan("owner-a", { dailyTargetMinutes: 20 }, providerReturning(samplePlan));

    await expect(evaluatePracticeAttempt("owner-a", {
      planItemId: plan.items[0].id,
      responseText: "My answer",
      durationSeconds: 10,
      idempotencyKey: "wrong-skill",
    }, providerReturning({ ...sampleEvaluation, skillKey: "grammar" }))).rejects.toMatchObject({
      code: "invalid_evaluation",
    });

    const count = getDatabase().prepare("SELECT COUNT(*) AS count FROM practice_attempts").get() as { count: number };
    expect(count.count).toBe(0);
  });
});
