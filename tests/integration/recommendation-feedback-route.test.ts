import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ensurePersistenceSchema } from "@/lib/database";
import { GET, POST } from "@/app/api/learning/recommendation-feedback/route";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: { close(): void } };
const databaseGlobal = globalThis as DatabaseGlobal;
const previousDatabasePath = process.env.SQLITE_DATABASE_PATH;
let temporaryDirectory: string | undefined;
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";

function setupDatabase() {
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-recommendation-feedback-"));
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

describe("recommendation feedback API", () => {
  it("stores and returns feedback for the current owner only", async () => {
    setupDatabase();
    const save = await POST(request("http://localhost/api/learning/recommendation-feedback", ownerA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommendationId: "skill:grammar", title: "Grammar practice", action: "not_for_me" }),
    }));
    expect(save.status).toBe(200);
    expect((await save.json()).feedback).toMatchObject([
      { recommendationId: "skill:grammar", title: "Grammar practice", action: "not_for_me" },
    ]);

    const ownerAResponse = await GET(request("http://localhost/api/learning/recommendation-feedback", ownerA));
    expect((await ownerAResponse.json()).feedback).toHaveLength(1);
    const ownerBResponse = await GET(request("http://localhost/api/learning/recommendation-feedback", ownerB));
    expect((await ownerBResponse.json()).feedback).toEqual([]);
  });

  it("rejects invalid feedback actions and oversized identifiers", async () => {
    setupDatabase();
    const invalidAction = await POST(request("http://localhost/api/learning/recommendation-feedback", ownerA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommendationId: "skill:grammar", title: "Grammar practice", action: "delete" }),
    }));
    expect(invalidAction.status).toBe(400);

    const oversizedId = await POST(request("http://localhost/api/learning/recommendation-feedback", ownerA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommendationId: "x".repeat(141), title: "Grammar practice", action: "helpful" }),
    }));
    expect(oversizedId.status).toBe(400);
  });

  it("retains only the latest 30 feedback entries", async () => {
    setupDatabase();
    for (let index = 0; index < 32; index += 1) {
      const response = await POST(request("http://localhost/api/learning/recommendation-feedback", ownerA, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recommendationId: `skill:${index}`, title: `Practice ${index}`, action: "helpful" }),
      }));
      expect(response.status).toBe(200);
    }
    const response = await GET(request("http://localhost/api/learning/recommendation-feedback", ownerA));
    const body = await response.json();
    expect(body.feedback).toHaveLength(30);
    expect(body.feedback[0].recommendationId).toBe("skill:2");
    expect(body.feedback.at(-1).recommendationId).toBe("skill:31");
  });
});
