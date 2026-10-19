import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { collectLearningData } from "@/lib/account-data-export";

describe("account learning data export", () => {
  it("exports only the current owner's learning records and strips identifiers and secrets", () => {
    const database = new Database(":memory:");
    try {
      database.exec(`
        CREATE TABLE practice_history (
          id INTEGER PRIMARY KEY,
          owner_id TEXT NOT NULL,
          activity TEXT NOT NULL,
          score INTEGER NOT NULL,
          password_hash TEXT,
          session_token TEXT,
          api_key TEXT
        );
        CREATE TABLE auth_login_attempts (
          owner_id TEXT,
          failed_attempts INTEGER
        );
        CREATE TABLE learner_accounts (
          owner_id TEXT,
          email TEXT,
          password_hash TEXT
        );
        INSERT INTO practice_history VALUES
          (1, 'owner-a', 'speaking', 82, 'secret-hash', 'secret-token', 'secret-key'),
          (2, 'owner-b', 'grammar', 63, 'other-hash', 'other-token', 'other-key');
        INSERT INTO auth_login_attempts VALUES ('owner-a', 5);
        INSERT INTO learner_accounts VALUES ('owner-a', 'learner@example.com', 'secret-hash');
      `);

      const result = collectLearningData(database, "owner-a");
      expect(Object.keys(result)).toEqual(["practice_history"]);
      expect(result.practice_history.records).toEqual([{ id: 1, activity: "speaking", score: 82 }]);
      expect(result.practice_history.truncated).toBe(false);
    } finally {
      database.close();
    }
  });

  it("does not return tables without owner scoping or rows belonging to another learner", () => {
    const database = new Database(":memory:");
    try {
      database.exec(`
        CREATE TABLE global_catalog (id INTEGER PRIMARY KEY, title TEXT);
        CREATE TABLE vocabulary_notes (id INTEGER PRIMARY KEY, owner_id TEXT, word TEXT);
        INSERT INTO global_catalog VALUES (1, 'public word');
        INSERT INTO vocabulary_notes VALUES (1, 'owner-b', 'bonjour');
      `);
      expect(collectLearningData(database, "owner-a")).toEqual({});
    } finally {
      database.close();
    }
  });
});
