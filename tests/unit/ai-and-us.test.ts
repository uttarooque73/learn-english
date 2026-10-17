import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { GET, POST } from "@/app/api/ai-and-us/route";

type DatabaseGlobal = typeof globalThis & { speakupDatabase?: Database.Database };
const databaseGlobal = globalThis as DatabaseGlobal;
let directory: string | undefined;
let priorPath: string | undefined;

function setup() {
  priorPath = process.env.SQLITE_DATABASE_PATH;
  directory = mkdtempSync(path.join(os.tmpdir(), "ai-and-us-test-"));
  process.env.SQLITE_DATABASE_PATH = path.join(directory, "test.sqlite");
  ensurePersistenceSchema();
}
function cleanup() {
  databaseGlobal.speakupDatabase?.close();
  delete databaseGlobal.speakupDatabase;
  if (priorPath === undefined) delete process.env.SQLITE_DATABASE_PATH;
  else process.env.SQLITE_DATABASE_PATH = priorPath;
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
}
function request(pathname: string, method = "GET", body?: unknown, owner = "test-owner") {
  return new NextRequest("http://localhost" + pathname, {
    method, headers: { cookie: "speakup_owner=" + owner, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
afterEach(cleanup);

describe("AI and Us practice API", () => {
  it("saves a paragraph and returns it only to its owner", async () => {
    setup();
    const saved = await POST(request("/api/ai-and-us", "POST", {
      kind: "paragraph", title: "Kitchen practice", text: "I prepare dinner every evening.", level: "Beginner",
    }));
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.paragraph.title).toBe("Kitchen practice");
    const ownerRead = await GET(request("/api/ai-and-us", "GET", undefined, "test-owner"));
    expect((await ownerRead.json()).paragraphs).toHaveLength(1);
    const otherRead = await GET(request("/api/ai-and-us", "GET", undefined, "other-owner"));
    expect((await otherRead.json()).paragraphs).toHaveLength(0);
  });

  it("rejects invalid paragraphs and invalid proficiency", async () => {
    setup();
    const empty = await POST(request("/api/ai-and-us", "POST", { kind: "paragraph", title: "", text: "", level: "Expert" }));
    expect(empty.status).toBe(400);
  });

  it("saves transcript comparison attempts only when the paragraph belongs to the owner", async () => {
    setup();
    const paragraph = await POST(request("/api/ai-and-us", "POST", { kind: "paragraph", title: "Daily", text: "I enjoy reading.", level: "Beginner" }));
    const id = (await paragraph.json()).paragraph.id as string;
    const saved = await POST(request("/api/ai-and-us", "POST", {
      kind: "attempt", paragraphId: id, target: "I enjoy reading.", transcript: "I enjoy reading", score: 100, missingWords: [], extraWords: [],
    }));
    expect(saved.status).toBe(200);
    const wrongOwner = await POST(request("/api/ai-and-us", "POST", {
      kind: "attempt", paragraphId: id, target: "I enjoy reading.", transcript: "I enjoy reading", score: 100,
    }, "different-owner"));
    expect(wrongOwner.status).toBe(400);
    const database = getDatabase();
    expect((database.prepare("SELECT COUNT(*) AS count FROM aius_reading_attempts WHERE owner_id = ?").get("test-owner") as { count: number }).count).toBe(1);
  });
});
