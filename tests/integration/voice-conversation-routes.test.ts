import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getSessions, POST as saveMessage } from "@/app/api/voice-conversations/session/route";
import { GET as getFeedback, POST as finalizeFeedback } from "@/app/api/voice-conversations/feedback/route";
import { GET as getPreferences, POST as savePreferences } from "@/app/api/voice-conversations/preferences/route";
import { POST as analyzeSentence } from "@/app/api/voice-conversations/sentence-feedback/route";
import Database from "better-sqlite3";
import { getDatabase } from "@/lib/database";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: Database.Database };
const databaseGlobal = globalThis as DatabaseGlobal;
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

function request(url: string, init: ConstructorParameters<typeof NextRequest>[1], owner = "owner-a") {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `speakup_owner=${owner}`);
  return new NextRequest(url, { ...init, headers });
}

beforeEach(() => {
  previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "voice-conversations-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "test.sqlite");
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (previousDatabasePath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = previousDatabasePath;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("floating voice conversation persistence", () => {
  it("persists a transcript and scopes history to its owner", async () => {
    const payload = {
      sessionId: "session-a",
      topic: "Software Development",
      proficiency: "Intermediate",
      startedAt: "2026-10-18T00:00:00.000Z",
      sequenceNumber: 0,
      message: {
        id: "message-a",
        role: "user",
        content: "I work as software engineer.",
        createdAt: "2026-10-18T00:00:01.000Z",
      },
    };
    const saved = await saveMessage(request("http://localhost/api/voice-conversations/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toMatchObject({ saved: true });

    const ownHistory = await getSessions(request("http://localhost/api/voice-conversations/session", { method: "GET" }, "owner-a"));
    await expect(ownHistory.json()).resolves.toMatchObject({
      sessions: [{ id: "session-a", topic: "Software Development", proficiency: "Intermediate" }],
    });

    const otherHistory = await getSessions(request("http://localhost/api/voice-conversations/session", { method: "GET" }, "owner-b"));
    await expect(otherHistory.json()).resolves.toEqual({ sessions: [] });
  });

  it("rejects another owner's attempt to append to an existing session", async () => {
    const payload = {
      sessionId: "private-session",
      topic: "Daily Life",
      proficiency: "Beginner",
      startedAt: "2026-10-18T00:00:00.000Z",
      sequenceNumber: 0,
      message: {
        id: "message-private",
        role: "user",
        content: "I like reading.",
        createdAt: "2026-10-18T00:00:01.000Z",
      },
    };
    expect((await saveMessage(request("http://localhost/api/voice-conversations/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    }, "owner-a"))).status).toBe(200);

    const crossOwner = await saveMessage(request("http://localhost/api/voice-conversations/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, message: { ...payload.message, id: "message-other" } }),
    }, "owner-b"));
    expect(crossOwner.status).toBe(404);

    const hiddenSession = await getFeedback(request("http://localhost/api/voice-conversations/feedback?sessionId=private-session", { method: "GET" }, "owner-b"));
    expect(hiddenSession.status).toBe(404);
  });

  it("records completed feedback as idempotent learning evidence", async () => {
    const item = {
      messageId: "learner-message",
      originalSentence: "I work as software engineer.",
      correctedSentence: "I work as a software engineer.",
      naturalSentence: null,
      isCorrect: false,
      errorCategories: ["grammar"],
      severity: "minor",
      explanation: "Use an article before a singular countable job title.",
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      response: JSON.stringify({ items: [item] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      sessionId: "learning-evidence-session",
      topic: "Software Development",
      proficiency: "Intermediate",
      durationSeconds: 25,
      messages: [
        { id: "learner-message", role: "user", content: item.originalSentence, createdAt: "2026-10-18T00:00:01.000Z" },
        { id: "assistant-message", role: "assistant", content: "Tell me more about your work.", createdAt: "2026-10-18T00:00:02.000Z" },
      ],
    };
    const invoke = () => finalizeFeedback(request("http://localhost/api/voice-conversations/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    const first = await invoke();
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ feedbackStatus: "complete", overallFeedback: { totalUtterances: 1, analyzedUtterances: 1, usefulExpressions: ["I work as a software engineer."] } });

    const database = getDatabase();
    expect((database.prepare("SELECT COUNT(*) AS count FROM practice_attempts WHERE owner_id=?").get("owner-a") as { count: number }).count).toBe(1);
    expect((database.prepare("SELECT COUNT(*) AS count FROM skill_assessments WHERE owner_id=? AND skill_key='speaking'").get("owner-a") as { count: number }).count).toBe(1);
    expect((database.prepare("SELECT COUNT(*) AS count FROM learning_mistakes WHERE owner_id=?").get("owner-a") as { count: number }).count).toBe(1);

    const second = await invoke();
    expect(second.status).toBe(200);
    expect((database.prepare("SELECT COUNT(*) AS count FROM practice_attempts WHERE owner_id=?").get("owner-a") as { count: number }).count).toBe(1);
    expect((database.prepare("SELECT COUNT(*) AS count FROM skill_assessments WHERE owner_id=? AND skill_key='speaking'").get("owner-a") as { count: number }).count).toBe(1);
  });

  it("validates feedback requests before calling the model provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await finalizeFeedback(request("http://localhost/api/voice-conversations/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "empty-session",
        topic: "Daily Life",
        proficiency: "Beginner",
        durationSeconds: 10,
        messages: [],
      }),
    }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists configurable sentence feedback and repetition preferences per owner", async () => {
    const defaults = await getPreferences(request("http://localhost/api/voice-conversations/preferences", { method: "GET" }, "owner-a"));
    await expect(defaults.json()).resolves.toEqual({ sentenceFeedbackEnabled: true, repeatAfterFeedbackEnabled: true });

    const saved = await savePreferences(request("http://localhost/api/voice-conversations/preferences", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentenceFeedbackEnabled: false, repeatAfterFeedbackEnabled: true }),
    }, "owner-a"));
    await expect(saved.json()).resolves.toEqual({ sentenceFeedbackEnabled: false, repeatAfterFeedbackEnabled: true });

    const otherOwner = await getPreferences(request("http://localhost/api/voice-conversations/preferences", { method: "GET" }, "owner-b"));
    await expect(otherOwner.json()).resolves.toEqual({ sentenceFeedbackEnabled: true, repeatAfterFeedbackEnabled: true });
  });

  it("analyzes and persists sentence feedback immediately with owner isolation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      response: JSON.stringify({
        originalSentence: "I work as software engineer.",
        correctedSentence: "I work as a software engineer.",
        naturalSentence: null,
        isCorrect: false,
        errorCategories: ["grammar"],
        severity: "minor",
        explanation: "Use an article before a singular countable job title.",
      }),
    })));
    const payload = {
      sessionId: "sentence-feedback-session",
      topic: "Software Development",
      proficiency: "Intermediate",
      startedAt: "2026-10-18T00:00:00.000Z",
      sequenceNumber: 1,
      message: { id: "sentence-feedback-message", role: "user", content: "I work as software engineer.", createdAt: "2026-10-18T00:00:01.000Z" },
    };
    const result = await analyzeSentence(request("http://localhost/api/voice-conversations/sentence-feedback", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    }, "owner-a"));
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({
      feedback: { messageId: "sentence-feedback-message", correctedSentence: "I work as a software engineer.", isCorrect: false },
    });
    const stored = getDatabase().prepare("SELECT COUNT(*) AS count FROM voice_conversation_feedback WHERE owner_id=? AND session_id=?")
      .get("owner-a", "sentence-feedback-session") as { count: number };
    expect(stored.count).toBe(1);
    const privateSession = await getFeedback(request("http://localhost/api/voice-conversations/feedback?sessionId=sentence-feedback-session", { method: "GET" }, "owner-b"));
    expect(privateSession.status).toBe(404);
  });

  it("validates preference values without changing saved configuration", async () => {
    const result = await savePreferences(request("http://localhost/api/voice-conversations/preferences", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentenceFeedbackEnabled: "false", repeatAfterFeedbackEnabled: true }),
    }));
    expect(result.status).toBe(400);
  });

});
