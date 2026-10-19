import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ensurePersistenceSchema } from "@/lib/database";
import { GET, POST } from "@/app/api/learning/daily-speaking-missions/route";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: { close(): void } };
const databaseGlobal = globalThis as DatabaseGlobal;
const previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
let temporaryDirectory: string | undefined;
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";

function setupDatabase() {
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-daily-missions-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "test.sqlite");
  ensurePersistenceSchema();
}

function request(url: string, owner: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(url, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), cookie: `speakup_owner=${owner}` },
  });
}

afterEach(() => {
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (previousDatabasePath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = previousDatabasePath;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("daily speaking missions API", () => {
  it("persists mission history per owner and does not expose it to another owner", async () => {
    setupDatabase();
    const response = await POST(request("http://localhost/api/learning/daily-speaking-missions", ownerA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-10-19", missionId: "clear-explanation", title: "Explain a technical idea simply",
        reflection: "I spoke more clearly.", completedAt: "2026-10-19T10:00:00.000Z",
      }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).history).toMatchObject([
      { date: "2026-10-19", missionId: "clear-explanation", reflection: "I spoke more clearly." },
    ]);
    expect((await (await GET(request("http://localhost/api/learning/daily-speaking-missions", ownerA))).json()).history).toHaveLength(1);
    expect((await (await GET(request("http://localhost/api/learning/daily-speaking-missions", ownerB))).json()).history).toEqual([]);
  });

  it("replaces a duplicate completion for the same local date", async () => {
    setupDatabase();
    const save = (reflection: string) => POST(request("http://localhost/api/learning/daily-speaking-missions", ownerA, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: "2026-10-19", missionId: "past-story", title: "Tell a short story", reflection, completedAt: "2026-10-19T10:00:00.000Z" }),
    }));
    await save("first");
    const result = await (await save("second")).json();
    expect(result.history).toHaveLength(1);
    expect(result.history[0].reflection).toBe("second");
  });

  it("rejects invalid mission payloads", async () => {
    setupDatabase();
    const response = await POST(request("http://localhost/api/learning/daily-speaking-missions", ownerA, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: "yesterday", missionId: "x", title: "", reflection: "x".repeat(501), completedAt: "not-a-date" }),
    }));
    expect(response.status).toBe(400);
  });

  it("retains only the latest 60 mission completions", async () => {
    setupDatabase();
    for (let day = 1; day <= 61; day += 1) {
      await POST(request("http://localhost/api/learning/daily-speaking-missions", ownerA, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify((() => {
          const date = new Date(Date.UTC(2026, 7, day)).toISOString().slice(0, 10);
          return { date, missionId: "past-story", title: `Mission ${day}`, reflection: "", completedAt: date + "T10:00:00.000Z" };
        })()),
      }));
    }
    const history = (await (await GET(request("http://localhost/api/learning/daily-speaking-missions", ownerA))).json()).history;
    expect(history).toHaveLength(60);
    expect(history[0].date).toBe("2026-08-02");
  });
});
