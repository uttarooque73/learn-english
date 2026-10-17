import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { ModelProviderError, type JsonValidator, type ModelProvider } from "@/lib/ai/model-provider";
import { resetMultiAgentLearningForTests, runMultiAgentLearningWorkflow } from "@/lib/ai/multi-agent-learning";
import { resetMultiAgentEvaluationForTests, runMultiAgentEvaluation } from "@/lib/ai/multi-agent-evaluation";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: { close(): void } };
const databaseGlobal = globalThis as DatabaseGlobal;
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

const samplePlan = {
  activities: [
    { activityType: "conversation", title: "Describe your morning", skillKey: "speaking", durationMinutes: 10, priority: 0.9, reason: "Practice speaking." },
    { activityType: "vocabulary", title: "Review useful words", skillKey: "vocabulary", durationMinutes: 5, priority: 0.7, reason: "Reinforce vocabulary." },
  ],
};
const sampleEvaluation = {
  score: 0.8,
  confidence: 0.75,
  skillKey: "speaking",
  feedback: "Your meaning is clear. Focus on natural phrasing.",
  strengths: ["Clear meaning"],
  corrections: [{ original: "I am agree", improved: "I agree", reason: "Agree is a verb." }],
};

function setupDatabase() {
  previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-multi-agent-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "test.sqlite");
  ensurePersistenceSchema();
}
function cleanupDatabase() {
  resetMultiAgentLearningForTests();
  resetMultiAgentEvaluationForTests();
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (previousDatabasePath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = previousDatabasePath;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
}
function providerForGraph(): ModelProvider {
  const generateJson = vi.fn(async <T,>(prompt: string, validate: JsonValidator<T>): Promise<T> => {
    const value = prompt.includes("You are an evidence-based English learning planner.") ? samplePlan : sampleEvaluation;
    if (!validate(value)) throw new ModelProviderError("invalid_output", "Mock response failed validation.");
    return value as T;
  });
  return {
    modelName: "test-model",
    generateText: vi.fn(async () => "unused"),
    generateJson: generateJson as unknown as ModelProvider["generateJson"],
  };
}
afterEach(cleanupDatabase);

describe("adaptive multi-agent learning workflows", () => {
  it("runs planning and evaluation graphs, checkpoints them, and records completed run metadata", async () => {
    setupDatabase();
    const provider = providerForGraph();
    const planned = await runMultiAgentLearningWorkflow("owner-a", {
      dailyTargetMinutes: 20,
      goal: "Speak more confidently",
    }, provider);

    expect(planned.plan.items).toHaveLength(2);
    expect(planned.diagnosis.focusSkills).toContain("speaking");
    expect(planned.agents).toEqual([
      "context-loader", "diagnostic-agent", "practice-planner-agent", "progress-analyst",
    ]);

    const evaluated = await runMultiAgentEvaluation("owner-a", {
      planItemId: planned.plan.items[0].id,
      responseText: "I am agree with you.",
      durationSeconds: 30,
      idempotencyKey: "multi-agent-attempt-1",
    }, provider);

    expect(evaluated.attempt.duplicate).toBe(false);
    expect(evaluated.attempt.evaluation.score).toBe(0.8);
    expect(evaluated.agents).toEqual(["evaluation-agent", "progress-analyst"]);
    expect(evaluated.summary).toContain("80% score");

    const runs = getDatabase().prepare(
      "SELECT workflow_name, status FROM agent_runs WHERE owner_id = ?",
    ).all("owner-a") as Array<{ workflow_name: string; status: string }>;
    expect(runs).toHaveLength(2);
    expect(runs).toEqual(expect.arrayContaining([
      { workflow_name: "adaptive-multi-agent-learning", status: "completed" },
      { workflow_name: "adaptive-multi-agent-evaluation", status: "completed" },
    ]));
    const checkpoints = getDatabase().prepare("SELECT COUNT(*) AS count FROM checkpoints").get() as { count: number };
    expect(checkpoints.count).toBeGreaterThan(0);
  });

  it("keeps attempt retries idempotent when the evaluation graph is invoked again", async () => {
    setupDatabase();
    const provider = providerForGraph();
    const planned = await runMultiAgentLearningWorkflow("owner-a", { dailyTargetMinutes: 20 }, provider);
    const input = {
      planItemId: planned.plan.items[0].id,
      responseText: "I am agree with you.",
      durationSeconds: 30,
      idempotencyKey: "multi-agent-attempt-retry",
    };

    expect((await runMultiAgentEvaluation("owner-a", input, provider)).attempt.duplicate).toBe(false);
    expect((await runMultiAgentEvaluation("owner-a", input, provider)).attempt.duplicate).toBe(true);
    const count = getDatabase().prepare("SELECT COUNT(*) AS count FROM practice_attempts WHERE owner_id = ?")
      .get("owner-a") as { count: number };
    expect(count.count).toBe(1);
  });
});
