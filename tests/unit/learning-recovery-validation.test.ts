import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { claimNextLearningJob, enqueueLearningJob } from "@/lib/learning-jobs";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: Database.Database };
const databaseGlobal = globalThis as DatabaseGlobal;
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

function setupDatabase() {
  previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-recovery-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "source.sqlite");
  ensurePersistenceSchema();
}

afterEach(() => {
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (previousDatabasePath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = previousDatabasePath;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("learning recovery and worker contention validation", () => {
  it("assigns each queued job to at most one worker across repeated competing claims", () => {
    setupDatabase();
    const claimTime = new Date("2026-10-17T12:00:00.000Z");
    const availableAt = new Date(claimTime.getTime() - 1_000).toISOString();
    for (let index = 0; index < 12; index += 1) {
      enqueueLearningJob("owner-a", "generate_daily_plan", { sequence: index }, {
        idempotencyKey: `contention-job-${index}`,
        priority: index % 3,
        availableAt,
      });
    }

    const claimed = Array.from({ length: 12 }, (_, index) =>
      claimNextLearningJob(`worker-${index}`, claimTime),
    ).filter((job) => job !== null);
    const ids = claimed.map((job) => job.id);
    const ownership = getDatabase().prepare(
      "SELECT id, status, claimed_by FROM learning_jobs WHERE status = 'running'",
    ).all() as Array<{ id: string; status: string; claimed_by: string }>;

    expect(claimed).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    expect(ownership).toHaveLength(12);
    expect(new Set(ownership.map((job) => job.claimed_by)).size).toBe(12);
    expect(ownership.every((job) => job.status === "running")).toBe(true);
    expect(claimNextLearningJob("worker-overflow", claimTime)).toBeNull();
  });

  it("backs up and restores the migrated database without losing learner records", async () => {
    setupDatabase();
    const source = getDatabase();
    source.prepare(`
      INSERT INTO learner_profiles (owner_id, timezone, daily_target_minutes, goals_json, schedule_enabled)
      VALUES (?, ?, ?, ?, 1)
    `).run("restore-owner", "Asia/Kolkata", 25, '["Workplace conversations"]');

    const backupPath = path.join(temporaryDirectory!, "restore-test.sqlite");
    await source.backup(backupPath);
    const restored = new Database(backupPath);
    try {
      const profile = restored.prepare(
        "SELECT timezone, daily_target_minutes, goals_json FROM learner_profiles WHERE owner_id = ?",
      ).get("restore-owner") as {
        timezone: string;
        daily_target_minutes: number;
        goals_json: string;
      } | undefined;
      const migrationCount = restored.prepare(
        "SELECT COUNT(*) AS count FROM schema_migrations",
      ).get() as { count: number };

      expect(profile).toEqual({
        timezone: "Asia/Kolkata",
        daily_target_minutes: 25,
        goals_json: '["Workplace conversations"]',
      });
      expect(migrationCount.count).toBe(8);
      expect(restored.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
    } finally {
      restored.close();
    }
  });
});
