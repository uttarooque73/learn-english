import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "speakup_owner";
const MAX_HISTORY = 100;
type HistoryEntry = { id: string; target: string; transcript: string; score: number | null; createdAt: string; favorite: boolean; activity: "listen" | "attempt" };

function ownerFor(req: NextRequest) {
  return req.cookies.get(COOKIE)?.value || randomUUID();
}
function respond(data: unknown, req: NextRequest, owner: string, status = 200) {
  const response = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!req.cookies.has(COOKIE)) response.cookies.set(COOKIE, owner, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000,
  });
  return response;
}
function schema() {
  ensurePersistenceSchema();
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS shadowing_history (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      target TEXT NOT NULL,
      transcript TEXT NOT NULL DEFAULT '',
      score INTEGER,
      created_at TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
      activity TEXT NOT NULL DEFAULT 'attempt' CHECK (activity IN ('listen', 'attempt'))
    );
    const columns = getDatabase().prepare("PRAGMA table_info(shadowing_history)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "activity")) {
      getDatabase().exec("ALTER TABLE shadowing_history ADD COLUMN activity TEXT NOT NULL DEFAULT 'attempt'");
    }
    CREATE INDEX IF NOT EXISTS idx_shadowing_history_owner_created
      ON shadowing_history(owner_id, created_at DESC);
  `);
}
function readEntry(row: Record<string, unknown>): HistoryEntry {
  return {
    id: String(row.id), target: String(row.target), transcript: String(row.transcript ?? ""),
    score: typeof row.score === "number" ? row.score : null,
    createdAt: String(row.createdAt), favorite: Boolean(row.favorite), activity: row.activity === "listen" ? "listen" : "attempt",
  };
}
function loadHistory(owner: string): HistoryEntry[] {
  const rows = getDatabase().prepare(
    "SELECT id,target,transcript,score,created_at AS createdAt,favorite,activity FROM shadowing_history WHERE owner_id=? ORDER BY created_at DESC LIMIT ?",
  ).all(owner, MAX_HISTORY) as Array<Record<string, unknown>>;
  return rows.map(readEntry);
}

function migrateLegacyHistory(owner: string): void {
  const db = getDatabase();
  const legacy = db.prepare("SELECT data_value FROM app_user_data WHERE owner_id=? AND data_key=?")
    .get(owner, "speakup:shadowing-history:v1") as { data_value?: string } | undefined;
  if (!legacy?.data_value) return;
  let parsed: unknown;
  try { parsed = JSON.parse(legacy.data_value); } catch { return; }
  if (!Array.isArray(parsed)) return;
  const insert = db.prepare("INSERT OR IGNORE INTO shadowing_history(id,owner_id,target,transcript,score,created_at,favorite) VALUES(?,?,?,?,?,?,?)");
  const migrate = db.transaction(() => {
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      if (typeof entry.id !== "string" || !entry.id || typeof entry.target !== "string" || !entry.target.trim()) continue;
      const score = typeof entry.score === "number" && Number.isInteger(entry.score) && entry.score >= 0 && entry.score <= 100 ? entry.score : null;
      const createdAt = typeof entry.createdAt === "string" && Number.isFinite(Date.parse(entry.createdAt)) ? entry.createdAt : new Date().toISOString();
      insert.run(entry.id, owner, entry.target.trim().slice(0, 240), typeof entry.transcript === "string" ? entry.transcript.slice(0, 2000) : "", score, createdAt, entry.favorite === true ? 1 : 0);
    }
    db.prepare("DELETE FROM app_user_data WHERE owner_id=? AND data_key=?").run(owner, "speakup:shadowing-history:v1");
  });
  migrate();
}

export async function GET(req: NextRequest) {
  const owner = ownerFor(req);
  try {
    schema();
    migrateLegacyHistory(owner);
    return respond({ history: loadHistory(owner) }, req, owner);
  } catch (error) {
    console.error("Shadowing history read failed", error);
    return respond({ error: "Could not load shadowing history from the database." }, req, owner, 503);
  }
}

export async function POST(req: NextRequest) {
  const owner = ownerFor(req);
  let body: unknown;
  try { body = await req.json(); } catch { return respond({ error: "Request body must be valid JSON." }, req, owner, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "A JSON object is required." }, req, owner, 400);
  const input = body as Record<string, unknown>;
  const target = typeof input.target === "string" ? input.target.trim() : "";
  const transcript = typeof input.transcript === "string" ? input.transcript.trim() : "";
  const score = input.score === null || input.score === undefined ? null : input.score;
  const activity = input.activity === "listen" ? "listen" : "attempt";
  if (!target || target.length > 240 || transcript.length > 2000
    || !(score === null || (typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 100))
    || (activity === "listen" && (transcript || score !== null))) {
    return respond({ error: "Provide a target (up to 240 characters), a transcript (up to 2,000 characters), and a valid word-match score." }, req, owner, 400);
  }
  try {
    schema();
    const db = getDatabase();
    const entry: HistoryEntry = { id: randomUUID(), target, transcript, score, createdAt: new Date().toISOString(), favorite: false, activity };
    const save = db.transaction(() => {
      db.prepare("INSERT INTO shadowing_history(id,owner_id,target,transcript,score,created_at,favorite,activity) VALUES(?,?,?,?,?,?,0,?)")
        .run(entry.id, owner, entry.target, entry.transcript, entry.score, entry.createdAt, entry.activity);
      db.prepare("DELETE FROM shadowing_history WHERE owner_id=? AND id NOT IN (SELECT id FROM shadowing_history WHERE owner_id=? ORDER BY created_at DESC LIMIT ?)")
        .run(owner, owner, MAX_HISTORY);
    });
    save();
    return respond({ entry }, req, owner, 201);
  } catch (error) {
    console.error("Shadowing history save failed", error);
    return respond({ error: "Could not save this attempt to the database." }, req, owner, 503);
  }
}

export async function PATCH(req: NextRequest) {
  const owner = ownerFor(req);
  let body: unknown;
  try { body = await req.json(); } catch { return respond({ error: "Request body must be valid JSON." }, req, owner, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "A JSON object is required." }, req, owner, 400);
  const input = body as Record<string, unknown>;
  if (typeof input.id !== "string" || !input.id || typeof input.favorite !== "boolean") {
    return respond({ error: "An attempt ID and favorite boolean are required." }, req, owner, 400);
  }
  try {
    schema();
    const result = getDatabase().prepare("UPDATE shadowing_history SET favorite=? WHERE id=? AND owner_id=?")
      .run(input.favorite ? 1 : 0, input.id, owner);
    if (!result.changes) return respond({ error: "Practice attempt not found." }, req, owner, 404);
    const row = getDatabase().prepare("SELECT id,target,transcript,score,created_at AS createdAt,favorite,activity FROM shadowing_history WHERE id=? AND owner_id=?")
      .get(input.id, owner) as Record<string, unknown>;
    return respond({ entry: readEntry(row) }, req, owner);
  } catch (error) {
    console.error("Shadowing history update failed", error);
    return respond({ error: "Could not update this practice attempt." }, req, owner, 503);
  }
}

export async function DELETE(req: NextRequest) {
  const owner = ownerFor(req);
  try {
    schema();
    const db = getDatabase();
    if (req.nextUrl.searchParams.get("all") === "1") {
      db.prepare("DELETE FROM shadowing_history WHERE owner_id=?").run(owner);
      return respond({ deleted: "all" }, req, owner);
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return respond({ error: "Provide an attempt ID or use all=1 to clear history." }, req, owner, 400);
    const result = db.prepare("DELETE FROM shadowing_history WHERE id=? AND owner_id=?").run(id, owner);
    if (!result.changes) return respond({ error: "Practice attempt not found." }, req, owner, 404);
    return respond({ deleted: id }, req, owner);
  } catch (error) {
    console.error("Shadowing history delete failed", error);
    return respond({ error: "Could not delete shadowing history." }, req, owner, 503);
  }
}
