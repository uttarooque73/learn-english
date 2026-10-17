import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ensurePersistenceSchema } from "@/lib/database";
import { GET as operationsGet } from "@/app/api/learning/operations/route";
import { POST as schedulerPost } from "@/app/api/learning/scheduler/route";
import { POST as workerPost } from "@/app/api/learning/worker/route";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: { close(): void } };
const databaseGlobal = globalThis as DatabaseGlobal;
const previous = {
  databasePath: process.env.SQLITE_DATABASE_PATH,
  workerSecret: process.env.LEARNING_WORKER_SECRET,
  automation: process.env.LEARNING_AUTOMATION_ENABLED,
};
let temporaryDirectory: string | undefined;
const secret = "integration-test-secret-with-enough-entropy";

function setupDatabase() {
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "speakup-operations-route-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "test.sqlite");
  ensurePersistenceSchema();
}

function authorizedRequest(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${secret}`);
  return new NextRequest(url, { ...init, headers });
}

afterEach(() => {
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (previous.databasePath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = previous.databasePath;
  if (previous.workerSecret === undefined) delete process.env.LEARNING_WORKER_SECRET;
  else process.env.LEARNING_WORKER_SECRET = previous.workerSecret;
  if (previous.automation === undefined) delete process.env.LEARNING_AUTOMATION_ENABLED;
  else process.env.LEARNING_AUTOMATION_ENABLED = previous.automation;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("learning operations and automation controls", () => {
  it("rejects operations requests without the operator secret", async () => {
    process.env.LEARNING_WORKER_SECRET = secret;
    const response = await operationsGet(new NextRequest("http://localhost/api/learning/operations"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves aggregate operational metrics only to an authorized operator", async () => {
    process.env.LEARNING_WORKER_SECRET = secret;
    setupDatabase();
    const response = await operationsGet(authorizedRequest("http://localhost/api/learning/operations"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.operations).toMatchObject({
      windowHours: 24,
      workflows: { recentRuns: 0, failed: 0, failureRate: 0 },
      jobs: { recentAttempts: 0 },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("pauses scheduler enqueueing and worker processing without deleting queued work", async () => {
    process.env.LEARNING_WORKER_SECRET = secret;
    process.env.LEARNING_AUTOMATION_ENABLED = "false";
    const schedulerResponse = await schedulerPost(authorizedRequest("http://localhost/api/learning/scheduler", { method: "POST" }));
    expect(schedulerResponse.status).toBe(200);
    expect(await schedulerResponse.json()).toMatchObject({ paused: true, enqueued: 0 });

    const workerResponse = await workerPost(authorizedRequest("http://localhost/api/learning/worker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 5 }),
    }));
    expect(workerResponse.status).toBe(200);
    expect(await workerResponse.json()).toMatchObject({ paused: true, processed: 0 });
  });
});
