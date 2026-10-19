import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: Database.Database };
const databaseGlobal = globalThis as DatabaseGlobal;
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

function resetDatabase() {
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (previousDatabasePath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = previousDatabasePath;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
}

function useTemporaryDatabase() {
  previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-migrations-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "test.sqlite");
}

afterEach(resetDatabase);

describe("SQLite schema migrations", () => {
  it("applies all numbered migrations and records each migration", () => {
    useTemporaryDatabase();

    ensurePersistenceSchema();

    const database = getDatabase();
    const applied = database
      .prepare("SELECT migration_name FROM schema_migrations ORDER BY migration_name")
      .all() as Array<{ migration_name: string }>;
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map(({ name }) => name));

    expect(applied.map(({ migration_name }) => migration_name)).toEqual([
      "001_app_user_data.sql",
      "002_daily_vocabulary.sql",
      "003_conversation_coach.sql",
      "004_learning_domain.sql",
      "005_agent_runs.sql",
      "006_learning_jobs.sql",
      "007_adaptation_policy.sql",
      "008_floating_voice_conversations.sql",
      "009_voice_conversation_preferences.sql",
      "010_word_sentence_practice.sql",
      "012_ai_and_us_paragraph_practice.sql",
      "013_aius_paragraph_feedback.sql",
      "014_auth_accounts.sql",
    ]);
    expect(tableNames).toContain("app_user_data");
    expect(tableNames).toContain("daily_vocabulary_topics");
    expect(tableNames).toContain("daily_vocabulary_entries");
    expect(tableNames).toContain("conversation_coach_sessions");
    expect(tableNames).toContain("conversation_coach_turns");
    expect(tableNames).toContain("learner_profiles");
    expect(tableNames).toContain("learner_skill_scores");
    expect(tableNames).toContain("skill_assessments");
    expect(tableNames).toContain("learning_plans");
    expect(tableNames).toContain("learning_plan_items");
    expect(tableNames).toContain("practice_attempts");
    expect(tableNames).toContain("learning_mistakes");
    expect(tableNames).toContain("vocabulary_review_events");
    expect(tableNames).toContain("agent_runs");
    expect(tableNames).toContain("learning_jobs");
    expect(tableNames).toContain("learning_job_attempts");
    expect(tableNames).toContain("learner_adaptation_settings");
    expect(tableNames).toContain("learning_plan_decisions");
    expect(tableNames).toContain("voice_conversation_sessions");
    expect(tableNames).toContain("voice_conversation_messages");
    expect(tableNames).toContain("voice_conversation_feedback");
    expect(tableNames).toContain("voice_conversation_preferences");
    expect(tableNames).toContain("aius_paragraphs");
    expect(tableNames).toContain("aius_reading_attempts");
    const paragraphColumns = database.prepare("PRAGMA table_info(aius_paragraphs)").all() as Array<{ name: string }>;
    expect(paragraphColumns.map((column) => column.name)).toContain("writing_feedback_json");
  });

  it("is safe to run repeatedly and preserves existing learner data", () => {
    useTemporaryDatabase();

    ensurePersistenceSchema();
    const database = getDatabase();
    database.prepare(
      "INSERT INTO app_user_data (owner_id, data_key, data_value) VALUES (?, ?, ?)",
    ).run("owner-a", "speakup:preferences", '{"dailyTarget":15}');

    expect(() => ensurePersistenceSchema()).not.toThrow();

    const saved = database.prepare(
      "SELECT data_value FROM app_user_data WHERE owner_id = ? AND data_key = ?",
    ).get("owner-a", "speakup:preferences") as { data_value: string } | undefined;
    const migrationCount = database.prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get() as { count: number };

    expect(saved?.data_value).toBe('{"dailyTarget":15}');
    expect(migrationCount.count).toBe(13);
  });
  it("enforces learner ownership across plan items and practice attempts", () => {
    useTemporaryDatabase();

    ensurePersistenceSchema();
    const database = getDatabase();
    database.prepare(
      "INSERT INTO learning_plans (id, owner_id, local_date) VALUES (?, ?, ?)",
    ).run("plan-a", "owner-a", "2026-10-17");
    database.prepare(
      "INSERT INTO learning_plan_items (id, plan_id, owner_id, position, activity_type, estimated_minutes) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("item-a", "plan-a", "owner-a", 0, "vocabulary", 5);

    expect(() => database.prepare(
      "INSERT INTO practice_attempts (id, owner_id, plan_item_id, activity_type) VALUES (?, ?, ?, ?)",
    ).run("attempt-wrong-owner", "owner-b", "item-a", "vocabulary")).toThrow();

    database.prepare(
      "INSERT INTO practice_attempts (id, owner_id, plan_item_id, activity_type) VALUES (?, ?, ?, ?)",
    ).run("attempt-a", "owner-a", "item-a", "vocabulary");
    const ownerA = database.prepare(
      "SELECT id FROM practice_attempts WHERE owner_id = ?",
    ).all("owner-a") as Array<{ id: string }>;
    const ownerB = database.prepare(
      "SELECT id FROM practice_attempts WHERE owner_id = ?",
    ).all("owner-b") as Array<{ id: string }>;

    expect(ownerA.map(({ id }) => id)).toEqual(["attempt-a"]);
    expect(ownerB).toEqual([]);
  });

  it("rejects invalid skill scores and orphaned plan items", () => {
    useTemporaryDatabase();

    ensurePersistenceSchema();
    const database = getDatabase();

    expect(() => database.prepare(
      "INSERT INTO learner_skill_scores (owner_id, skill_key, mastery) VALUES (?, ?, ?)",
    ).run("owner-a", "speaking", 1.5)).toThrow();
    expect(() => database.prepare(
      "INSERT INTO learning_plan_items (id, plan_id, owner_id, position, activity_type, estimated_minutes) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("item-no-plan", "missing-plan", "owner-a", 0, "speaking", 10)).toThrow();
  });

  it("adopts legacy inline-created tables without deleting their rows", () => {
    useTemporaryDatabase();

    const database = getDatabase();
    database.exec(`
      CREATE TABLE daily_vocabulary_topics (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Custom',
        instructions TEXT NOT NULL DEFAULT '', difficulty TEXT NOT NULL DEFAULT 'intermediate',
        daily_allocation INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    database.prepare(
      "INSERT INTO daily_vocabulary_topics (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run("legacy-topic", "owner-a", "Kitchen", "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");

    expect(() => ensurePersistenceSchema()).not.toThrow();

    const saved = database.prepare(
      "SELECT name FROM daily_vocabulary_topics WHERE id = ? AND owner_id = ?",
    ).get("legacy-topic", "owner-a") as { name: string } | undefined;
    expect(saved?.name).toBe("Kitchen");
  });

});
