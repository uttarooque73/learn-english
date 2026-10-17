import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import {
  resetLearningWorkflowForTests,
  runLearningWorkflow,
  resumeLearningWorkflow,
  LearningWorkflowError,
} from "@/lib/ai/learning-workflow";
import { createOllamaProvider, ModelProviderError } from "@/lib/ai/model-provider";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: { close(): void } };
const databaseGlobal = globalThis as DatabaseGlobal;
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

function setupDatabase() {
  previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-workflow-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "test.sqlite");
}

function cleanupDatabase() {
  resetLearningWorkflowForTests();
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (previousDatabasePath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = previousDatabasePath;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
}

afterEach(cleanupDatabase);

describe("learning workflow foundation", () => {
  it("runs a deterministic graph and persists owner-scoped run status", async () => {
    setupDatabase();

    const result = await runLearningWorkflow("owner-a", "  Speak   more confidently.  ");

    expect(result.run.status).toBe("completed");
    expect(result.run.workflowName).toBe("learning-foundation");
    expect(result.result).toEqual({
      accepted: true,
      normalizedGoal: "Speak more confidently.",
    });
    expect(await resumeLearningWorkflow("owner-b", result.run.runId)).toBeNull();

    const checkpointCount = getDatabase().prepare(
      "SELECT COUNT(*) AS count FROM checkpoints",
    ).get() as { count: number };
    expect(checkpointCount.count).toBeGreaterThan(0);

    // Simulate a process restart after the checkpoint was saved but before run status was finalized.
    getDatabase().prepare(
      "UPDATE agent_runs SET status = 'running', finished_at = NULL, duration_ms = NULL WHERE run_id = ?",
    ).run(result.run.runId);
    resetLearningWorkflowForTests();
    expect((await resumeLearningWorkflow("owner-a", result.run.runId))?.status).toBe("completed");

    const row = getDatabase().prepare(
      "SELECT owner_id, status, error_code FROM agent_runs WHERE run_id = ?",
    ).get(result.run.runId) as { owner_id: string; status: string; error_code: string | null };

    expect(row).toEqual({ owner_id: "owner-a", status: "completed", error_code: null });
  });

  it("records invalid input as a bounded failure without exposing raw errors", async () => {
    setupDatabase();

    await expect(runLearningWorkflow("owner-a", "   ")).rejects.toMatchObject({
      name: "LearningWorkflowError",
      code: "invalid_input",
    });

    const row = getDatabase().prepare(
      "SELECT status, error_code FROM agent_runs WHERE owner_id = ?",
    ).get("owner-a") as { status: string; error_code: string };

    expect(row).toEqual({ status: "failed", error_code: "invalid_input" });
  });

  it("rejects an invalid owner before creating a run", async () => {
    setupDatabase();
    ensurePersistenceSchema();

    await expect(runLearningWorkflow("", "Practice speaking")).rejects.toBeInstanceOf(LearningWorkflowError);
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM agent_runs").get()).toEqual({ count: 0 });
  });
});

describe("Ollama model provider adapter", () => {
  it("sends bounded non-streaming requests and returns generated text", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ response: "Hello there." }), { status: 200 }));
    const provider = createOllamaProvider({
      baseUrl: "http://localhost:11434/",
      model: "qwen3:4b",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.generateText("Say hello")).resolves.toBe("Hello there.");
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:11434/api/generate", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ model: "qwen3:4b", prompt: "Say hello", stream: false }),
    }));
  });

  it("validates JSON output against the caller's schema", async () => {
    type Answer = { score: number };
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ format: "json", stream: false });
      return new Response(JSON.stringify({ response: '{"score":0.8}' }), { status: 200 });
    });
    const provider = createOllamaProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.generateJson<Answer>(
      "Return a score",
      (value): value is Answer => !!value && typeof value === "object"
        && typeof (value as Answer).score === "number"
        && (value as Answer).score >= 0 && (value as Answer).score <= 1,
    )).resolves.toEqual({ score: 0.8 });
  });

  it("classifies invalid output, provider errors, and timeouts", async () => {
    const invalidJsonFetch = vi.fn(async () => new Response(JSON.stringify({ response: "not json" }), { status: 200 }));
    const invalidJsonProvider = createOllamaProvider({ fetchImpl: invalidJsonFetch as unknown as typeof fetch });
    await expect(invalidJsonProvider.generateJson("Return JSON", (value): value is object =>
      !!value && typeof value === "object")).rejects.toMatchObject({ code: "invalid_output" });

    const unavailableFetch = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const unavailableProvider = createOllamaProvider({ fetchImpl: unavailableFetch as unknown as typeof fetch });
    await expect(unavailableProvider.generateText("hello")).rejects.toMatchObject({
      name: "ModelProviderError",
      code: "provider_unavailable",
    });

    const timeoutFetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const timeoutProvider = createOllamaProvider({ fetchImpl: timeoutFetch as unknown as typeof fetch });
    await expect(timeoutProvider.generateText("hello", 5)).rejects.toBeInstanceOf(ModelProviderError);
    await expect(timeoutProvider.generateText("hello", 5)).rejects.toMatchObject({ code: "timeout" });
  });

  it("rejects empty and oversized prompts before contacting the provider", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ response: "never" }), { status: 200 }));
    const provider = createOllamaProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.generateText(" ")).rejects.toMatchObject({ code: "invalid_request" });
    await expect(provider.generateText("x".repeat(16_001))).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
