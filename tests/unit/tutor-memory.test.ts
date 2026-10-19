import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensurePersistenceSchema } from "@/lib/database";
import { appendTutorTurn, createTutorConversation, deleteTutorConversation, getTutorConversation, listTutorConversations } from "@/lib/ai/tutor-memory";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: Database.Database };
const databaseGlobal = globalThis as DatabaseGlobal;
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

function setupDatabase() {
  previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-tutor-memory-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "tutor.sqlite");
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

describe("persistent AI tutor memory", () => {
  it("saves tutor turns and restores them in order", () => {
    setupDatabase();
    const conversation = createTutorConversation("owner-a", {
      goal: "Improve grammar", level: "Intermediate", feedbackStyle: "balanced",
    });

    const updated = appendTutorTurn("owner-a", conversation.id, {
      userMessage: "Yesterday I go to work.",
      assistantMessage: "Say: Yesterday I went to work. Use 'went' for the past.",
      goal: "Improve grammar",
      level: "Intermediate",
      feedbackStyle: "balanced",
    });

    expect(updated?.messages).toEqual([
      { role: "user", content: "Yesterday I go to work." },
      { role: "assistant", content: "Say: Yesterday I went to work. Use 'went' for the past." },
    ]);
    expect(getTutorConversation("owner-a", conversation.id)?.title).toBe("Yesterday I go to work.");
    expect(listTutorConversations("owner-a")).toMatchObject([{ id: conversation.id, title: "Yesterday I go to work." }]);
    expect(listTutorConversations("owner-b")).toEqual([]);
  });

  it("does not expose another owner's conversation and limits deletion to its owner", () => {
    setupDatabase();
    const conversation = createTutorConversation("owner-a", {
      goal: "Speak more confidently", level: "Beginner", feedbackStyle: "detailed",
    });

    expect(getTutorConversation("owner-b", conversation.id)).toBeNull();
    expect(deleteTutorConversation("owner-b", conversation.id)).toBe(false);
    expect(getTutorConversation("owner-a", conversation.id)).not.toBeNull();
    expect(deleteTutorConversation("owner-a", conversation.id)).toBe(true);
    expect(getTutorConversation("owner-a", conversation.id)).toBeNull();
  });
});
