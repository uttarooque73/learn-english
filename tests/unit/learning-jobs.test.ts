import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import {
  claimNextLearningJob,
  completeLearningJob,
  enqueueDailyPlansForEligibleLearners,
  enqueueLearningJob,
  failLearningJob,
  getLearningJobStats,
} from "@/lib/learning-jobs";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: { close(): void } };
const databaseGlobal = globalThis as DatabaseGlobal;
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

function setupDatabase() {
  previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-jobs-"));
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

describe("durable learning jobs", () => {
  it("enqueues idempotently, claims by priority, and completes only for the lease owner", () => {
    setupDatabase();
    const first = enqueueLearningJob("owner-a", "generate_daily_plan", { localDate: "2026-10-17" }, {
      idempotencyKey: "daily-plan:2026-10-17", priority: 1,
    });
    const duplicate = enqueueLearningJob("owner-a", "generate_daily_plan", { localDate: "2026-10-17" }, {
      idempotencyKey: "daily-plan:2026-10-17", priority: 1,
    });
    enqueueLearningJob("owner-b", "generate_daily_plan", { localDate: "2026-10-17" }, {
      idempotencyKey: "daily-plan:2026-10-17", priority: 10,
    });

    expect(duplicate.id).toBe(first.id);
    expect(getLearningJobStats().queued).toBe(2);

    const claimed = claimNextLearningJob("worker-a");
    expect(claimed?.ownerId).toBe("owner-b");
    expect(claimed?.status).toBe("running");
    expect(completeLearningJob(claimed!.id, "worker-b", { planId: "plan-b" })).toBe(false);
    expect(completeLearningJob(claimed!.id, "worker-a", { planId: "plan-b" })).toBe(true);
    expect(getLearningJobStats().completed).toBe(1);

    const next = claimNextLearningJob("worker-a");
    expect(next?.id).toBe(first.id);
    expect(completeLearningJob(next!.id, "worker-a", { planId: "plan-a" })).toBe(true);

    const attempts = getDatabase().prepare(
      "SELECT status FROM learning_job_attempts ORDER BY created_at ASC",
    ).all() as Array<{ status: string }>;
    expect(attempts.every((attempt) => attempt.status === "completed")).toBe(true);
  });

  it("retries with backoff and stops after the configured attempt limit", () => {
    setupDatabase();
    const now = new Date("2026-10-17T00:00:00.000Z");
    const job = enqueueLearningJob("owner-a", "generate_daily_plan", { localDate: "2026-10-17" }, {
      idempotencyKey: "retry-job", maxAttempts: 2, availableAt: now.toISOString(),
    });

    const first = claimNextLearningJob("worker-a", now, 1_000);
    expect(first?.id).toBe(job.id);
    expect(failLearningJob(job.id, "worker-a", "provider_unavailable", true, now)).toBe("queued");
    const retryRow = getDatabase().prepare("SELECT available_at FROM learning_jobs WHERE id = ?")
      .get(job.id) as { available_at: string };
    expect(retryRow.available_at).toBe(new Date(now.getTime() + 1_000).toISOString());

    const secondTime = new Date(now.getTime() + 1_000);
    const second = claimNextLearningJob("worker-b", secondTime, 1_000);
    expect(second?.attempts).toBe(2);
    expect(failLearningJob(job.id, "worker-b", "provider_unavailable", true, secondTime)).toBe("failed");
    expect(getLearningJobStats().failed).toBe(1);

    const attempts = getDatabase().prepare(
      "SELECT status, error_code FROM learning_job_attempts WHERE job_id = ? ORDER BY attempt_number",
    ).all(job.id) as Array<{ status: string; error_code: string | null }>;
    expect(attempts).toEqual([
      { status: "retrying", error_code: "provider_unavailable" },
      { status: "failed", error_code: "provider_unavailable" },
    ]);
  });

  it("recovers expired worker leases and records the abandoned attempt", () => {
    setupDatabase();
    const now = new Date("2026-10-17T01:00:00.000Z");
    const job = enqueueLearningJob("owner-a", "generate_daily_plan", {}, {
      idempotencyKey: "lease-job", maxAttempts: 3, availableAt: now.toISOString(),
    });

    expect(claimNextLearningJob("worker-crashed", now, 1_000)?.attempts).toBe(1);
    const reclaimed = claimNextLearningJob("worker-replacement", new Date(now.getTime() + 1_001), 1_000);

    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.attempts).toBe(2);
    const attempts = getDatabase().prepare(
      "SELECT status, error_code FROM learning_job_attempts WHERE job_id = ? ORDER BY attempt_number",
    ).all(job.id) as Array<{ status: string; error_code: string | null }>;
    expect(attempts).toEqual([
      { status: "retrying", error_code: "lease_expired" },
      { status: "running", error_code: null },
    ]);
  });

  it("enqueues one daily plan job per enabled learner and local date", () => {
    setupDatabase();
    getDatabase().prepare(`
      INSERT INTO learner_profiles (owner_id, timezone, daily_target_minutes, goals_json, schedule_enabled)
      VALUES (?, ?, ?, ?, 1)
    `).run("owner-a", "Asia/Kolkata", 20, '["Speak more confidently"]');

    const first = enqueueDailyPlansForEligibleLearners();
    const second = enqueueDailyPlansForEligibleLearners();

    expect(first).toEqual({ eligible: 1, enqueued: 1, skipped: 0 });
    expect(second).toEqual({ eligible: 1, enqueued: 0, skipped: 1 });
    const job = getDatabase().prepare(
      "SELECT payload_json, idempotency_key FROM learning_jobs WHERE owner_id = ?",
    ).get("owner-a") as { payload_json: string; idempotency_key: string };
    expect(job.idempotency_key).toMatch(/^daily-plan:\d{4}-\d{2}-\d{2}$/);
    expect(JSON.parse(job.payload_json)).toMatchObject({
      dailyTargetMinutes: 20,
      goal: "Speak more confidently",
    });
  });

  it("does not claim future jobs", () => {
    setupDatabase();
    enqueueLearningJob("owner-a", "generate_daily_plan", {}, {
      idempotencyKey: "future-job", availableAt: "2099-01-01T00:00:00.000Z",
    });

    expect(claimNextLearningJob("worker-a", new Date("2026-10-17T00:00:00.000Z"))).toBeNull();
    expect(getLearningJobStats().queued).toBe(1);
  });
});
