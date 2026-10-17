import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { getLearningOperationsSnapshot, isLearningAutomationEnabled } from "@/lib/learning-operations";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: { close(): void } };
const databaseGlobal = globalThis as DatabaseGlobal;
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

function setupDatabase() {
  previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-operations-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "test.sqlite");
  ensurePersistenceSchema();
}

function cleanupDatabase() {
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (previousDatabasePath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = previousDatabasePath;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
}

afterEach(cleanupDatabase);

describe("learning operations", () => {
  it("returns aggregated workflow and job health without learner content", () => {
    setupDatabase();
    const database = getDatabase();
    const now = new Date("2026-10-17T12:00:00.000Z");
    const recent = "2026-10-17T11:00:00.000Z";
    database.prepare(`
      INSERT INTO agent_runs (run_id, owner_id, workflow_name, graph_version, status, input_hash, started_at, finished_at, duration_ms, error_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("run-ok", "private-owner", "learning-foundation", "v1", "completed", "hash", recent, recent, 100, null, recent);
    database.prepare(`
      INSERT INTO agent_runs (run_id, owner_id, workflow_name, graph_version, status, input_hash, started_at, finished_at, duration_ms, error_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("run-fail", "private-owner", "learning-foundation", "v1", "failed", "hash", recent, recent, 0, "provider_unavailable", recent);

    const snapshot = getLearningOperationsSnapshot(now);
    expect(snapshot.workflows).toMatchObject({
      recentRuns: 2, completed: 1, failed: 1, running: 0, failureRate: 0.5,
      durationMs: { p50: 100, p95: 100, max: 100 },
      failuresByCode: [{ errorCode: "provider_unavailable", count: 1 }],
    });
    expect(JSON.stringify(snapshot)).not.toContain("private-owner");
    expect(snapshot.jobs.recentAttempts).toBe(0);
    expect(snapshot.queue).toMatchObject({ queued: 0, running: 0, failed: 0 });
  });

  it("counts only the trailing 24-hour window and handles an empty window", () => {
    setupDatabase();
    const snapshot = getLearningOperationsSnapshot(new Date("2026-10-17T12:00:00.000Z"));
    expect(snapshot.workflows).toMatchObject({
      recentRuns: 0, completed: 0, failed: 0, failureRate: 0,
      durationMs: { p50: null, p95: null, max: null },
    });
    expect(snapshot.windowHours).toBe(24);
  });

  it("keeps automation enabled by default but supports an explicit rollout pause", () => {
    expect(isLearningAutomationEnabled(undefined)).toBe(true);
    expect(isLearningAutomationEnabled("true")).toBe(true);
    expect(isLearningAutomationEnabled("false")).toBe(false);
    expect(isLearningAutomationEnabled("0")).toBe(false);
  });
});
