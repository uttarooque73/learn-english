import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getSessions, POST as saveMessage } from "@/app/api/voice-conversations/session/route";
import { GET as getFeedback, POST as finalizeFeedback } from "@/app/api/voice-conversations/feedback/route";
import Database from "better-sqlite3";

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
});
