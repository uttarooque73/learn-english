import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "speakup_owner";
const MAX_HISTORY = 100;
type FluencyEntry = { id: string; exercise: string; prompt: string; transcript: string; createdAt: string; durationSeconds: number };

function ownerFor(req: NextRequest) { return req.cookies.get(COOKIE)?.value || randomUUID(); }
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
    CREATE TABLE IF NOT EXISTS fluency_speaking_history (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, exercise TEXT NOT NULL,
      prompt TEXT NOT NULL, transcript TEXT NOT NULL, created_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_fluency_history_owner_created
      ON fluency_speaking_history(owner_id, created_at DESC);
  `);
}
function readEntry(row: Record<string, unknown>): FluencyEntry {
  return { id: String(row.id), exercise: String(row.exercise), prompt: String(row.prompt),
    transcript: String(row.transcript), createdAt: String(row.createdAt), durationSeconds: Number(row.durationSeconds) || 0 };
}

export async function GET(req: NextRequest) {
  const owner = ownerFor(req);
  try {
    schema();
    const rows = getDatabase().prepare(
      "SELECT id,exercise,prompt,transcript,created_at AS createdAt,duration_seconds AS durationSeconds FROM fluency_speaking_history WHERE owner_id=? ORDER BY created_at DESC LIMIT ?",
    ).all(owner, MAX_HISTORY) as Array<Record<string, unknown>>;
    return respond({ history: rows.map(readEntry) }, req, owner);
  } catch (error) {
    console.error("Fluency history read failed", error);
    return respond({ error: "Could not load speaking history from the database." }, req, owner, 503);
  }
}

export async function POST(req: NextRequest) {
  const owner = ownerFor(req);
  let body: unknown;
  try { body = await req.json(); } catch { return respond({ error: "Request body must be valid JSON." }, req, owner, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "A JSON object is required." }, req, owner, 400);
  const input = body as Record<string, unknown>;
  const exercise = typeof input.exercise === "string" ? input.exercise.trim() : "";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const transcript = typeof input.transcript === "string" ? input.transcript.trim() : "";
  const durationSeconds = input.durationSeconds;
  if (!["quick", "daily", "minute", "fillers"].includes(exercise) || !prompt || prompt.length > 500
    || !transcript || transcript.length > 10000 || typeof durationSeconds !== "number"
    || !Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 86400) {
    return respond({ error: "Provide a valid exercise, prompt, spoken transcript, and duration." }, req, owner, 400);
  }
  try {
    schema();
    const db = getDatabase();
    const entry: FluencyEntry = { id: randomUUID(), exercise, prompt, transcript, durationSeconds, createdAt: new Date().toISOString() };
    const save = db.transaction(() => {
      db.prepare("INSERT INTO fluency_speaking_history(id,owner_id,exercise,prompt,transcript,created_at,duration_seconds) VALUES(?,?,?,?,?,?,?)")
        .run(entry.id, owner, entry.exercise, entry.prompt, entry.transcript, entry.createdAt, entry.durationSeconds);
      db.prepare("DELETE FROM fluency_speaking_history WHERE owner_id=? AND id NOT IN (SELECT id FROM fluency_speaking_history WHERE owner_id=? ORDER BY created_at DESC LIMIT ?)")
        .run(owner, owner, MAX_HISTORY);
    });
    save();
    return respond({ entry }, req, owner, 201);
  } catch (error) {
    console.error("Fluency history save failed", error);
    return respond({ error: "Could not save speaking practice to the database." }, req, owner, 503);
  }
}

export async function DELETE(req: NextRequest) {
  const owner = ownerFor(req);
  const id = req.nextUrl.searchParams.get("id");
  try {
    schema();
    if (id === "all") getDatabase().prepare("DELETE FROM fluency_speaking_history WHERE owner_id=?").run(owner);
    else if (id) getDatabase().prepare("DELETE FROM fluency_speaking_history WHERE owner_id=? AND id=?").run(owner, id);
    else return respond({ error: "Provide an entry ID or id=all." }, req, owner, 400);
    return respond({ deleted: id }, req, owner);
  } catch (error) {
    console.error("Fluency history delete failed", error);
    return respond({ error: "Could not delete speaking history." }, req, owner, 503);
  }
}
