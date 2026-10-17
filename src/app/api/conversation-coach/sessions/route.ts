import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = "speakup_owner";
const MAX_TURNS = 160;
const MAX_TEXT = 4000;
type TurnInput = { id?: string; role: "user" | "assistant"; content: string; corrections?: Correction[]; createdAt?: string };
type Correction = { original: string; improved: string; reason: string };
function ownerFor(req: NextRequest) { return req.cookies.get(COOKIE)?.value || randomUUID(); }
function respond(data: unknown, req: NextRequest, owner: string, status = 200) {
  const response = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!req.cookies.has(COOKIE)) response.cookies.set(COOKIE, owner, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000 });
  return response;
}
function schema() {
  ensurePersistenceSchema();
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS conversation_coach_sessions (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Conversation practice',
      scenario TEXT NOT NULL DEFAULT 'Free conversation', difficulty TEXT NOT NULL DEFAULT 'Intermediate',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
      started_at TEXT NOT NULL, updated_at TEXT NOT NULL, duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds >= 0),
      summary_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_coach_sessions_owner_updated ON conversation_coach_sessions(owner_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS conversation_coach_turns (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, owner_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
      correction_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES conversation_coach_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_coach_turns_owner_session ON conversation_coach_turns(owner_id, session_id, created_at ASC);
  `);
}
function cleanCorrections(value: unknown): Correction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is Correction => !!x && typeof x === "object"
    && typeof x.original === "string" && typeof x.improved === "string" && typeof x.reason === "string")
    .slice(0, 8).map(x => ({ original: x.original.slice(0, 1000), improved: x.improved.slice(0, 1000), reason: x.reason.slice(0, 1000) }));
}
function validTurn(value: unknown): value is TurnInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const t = value as Record<string, unknown>;
  return (t.role === "user" || t.role === "assistant") && typeof t.content === "string"
    && !!t.content.trim() && t.content.length <= MAX_TEXT;
}
function loadSession(id: string, owner: string) {
  const db = getDatabase();
  const row = db.prepare("SELECT id,title,scenario,difficulty,status,started_at AS startedAt,updated_at AS updatedAt,duration_seconds AS durationSeconds,summary_json AS summaryJson FROM conversation_coach_sessions WHERE id=? AND owner_id=?").get(id, owner) as Record<string, unknown> | undefined;
  if (!row) return null;
  const turns = db.prepare("SELECT id,role,content,correction_json AS correctionJson,created_at AS createdAt FROM conversation_coach_turns WHERE session_id=? AND owner_id=? ORDER BY created_at ASC,rowid ASC").all(id, owner) as Array<Record<string, unknown>>;
  return { ...row, durationSeconds: Number(row.durationSeconds), summary: parseJson(row.summaryJson, {}), turns: turns.map(t => ({ id: t.id, role: t.role, content: t.content, createdAt: t.createdAt, corrections: parseJson(t.correctionJson, []) })) };
}
function parseJson(value: unknown, fallback: unknown) { try { return JSON.parse(String(value ?? "")); } catch { return fallback; } }

export async function GET(req: NextRequest) {
  const owner = ownerFor(req);
  try {
    schema();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const session = loadSession(id, owner);
      return session ? respond({ session }, req, owner) : respond({ error: "Conversation session not found." }, req, owner, 404);
    }
    const sessions = getDatabase().prepare(`SELECT s.id,s.title,s.scenario,s.difficulty,s.status,s.started_at AS startedAt,s.updated_at AS updatedAt,s.duration_seconds AS durationSeconds,
      (SELECT COUNT(*) FROM conversation_coach_turns t WHERE t.session_id=s.id AND t.owner_id=s.owner_id) AS turnCount
      FROM conversation_coach_sessions s WHERE s.owner_id=? ORDER BY s.updated_at DESC LIMIT 100`).all(owner);
    return respond({ sessions }, req, owner);
  } catch (error) {
    console.error("Conversation coach read failed", error);
    return respond({ error: "Could not load conversation history from SQLite." }, req, owner, 503);
  }
}
export async function POST(req: NextRequest) {
  const owner = ownerFor(req);
  let body: unknown;
  try { body = await req.json(); } catch { return respond({ error: "Request body must be valid JSON." }, req, owner, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "A JSON object is required." }, req, owner, 400);
  const input = body as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "Conversation practice";
  const scenario = typeof input.scenario === "string" ? input.scenario.trim().slice(0, 100) : "Free conversation";
  const difficulty = ["Beginner", "Intermediate", "Advanced"].includes(String(input.difficulty)) ? String(input.difficulty) : "Intermediate";
  const turns = Array.isArray(input.turns) ? input.turns : [];
  if (!scenario || turns.length > MAX_TURNS || !turns.every(validTurn)) return respond({ error: "Provide a scenario and up to 160 valid conversation turns." }, req, owner, 400);
  const id = randomUUID(), now = new Date().toISOString();
  try {
    schema();
    const db = getDatabase();
    const save = db.transaction(() => {
      db.prepare("INSERT INTO conversation_coach_sessions(id,owner_id,title,scenario,difficulty,status,started_at,updated_at,duration_seconds,summary_json) VALUES(?,?,?,?,?,'active',?,?,0,'{}')")
        .run(id, owner, title || "Conversation practice", scenario, difficulty, now, now);
      const insert = db.prepare("INSERT INTO conversation_coach_turns(id,session_id,owner_id,role,content,correction_json,created_at) VALUES(?,?,?,?,?,?,?)");
      for (const raw of turns as TurnInput[]) insert.run(randomUUID(), id, owner, raw.role, raw.content.trim(), JSON.stringify(cleanCorrections(raw.corrections)), typeof raw.createdAt === "string" && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : now);
    });
    save();
    return respond({ session: loadSession(id, owner) }, req, owner, 201);
  } catch (error) {
    console.error("Conversation coach save failed", error);
    return respond({ error: "Could not save this conversation to SQLite." }, req, owner, 503);
  }
}
export async function PATCH(req: NextRequest) {
  const owner = ownerFor(req);
  let body: unknown;
  try { body = await req.json(); } catch { return respond({ error: "Request body must be valid JSON." }, req, owner, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "A JSON object is required." }, req, owner, 400);
  const input = body as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id : "";
  const status = input.status === "completed" ? "completed" : input.status === "active" ? "active" : null;
  const turns = input.turns;
  const duration = Number(input.durationSeconds ?? 0);
  if (!id || (!status && turns === undefined && input.summary === undefined) || (status && !["active", "completed"].includes(status))
    || !Number.isInteger(duration) || duration < 0 || duration > 86400
    || (turns !== undefined && (!Array.isArray(turns) || turns.length > MAX_TURNS || !turns.every(validTurn)))) {
    return respond({ error: "Provide a valid session ID and updates." }, req, owner, 400);
  }
  try {
    schema();
    const db = getDatabase();
    const exists = db.prepare("SELECT id FROM conversation_coach_sessions WHERE id=? AND owner_id=?").get(id, owner);
    if (!exists) return respond({ error: "Conversation session not found." }, req, owner, 404);
    const update = db.transaction(() => {
      if (status) db.prepare("UPDATE conversation_coach_sessions SET status=?,updated_at=?,duration_seconds=? WHERE id=? AND owner_id=?").run(status, new Date().toISOString(), duration, id, owner);
      if (input.summary !== undefined) db.prepare("UPDATE conversation_coach_sessions SET summary_json=?,updated_at=? WHERE id=? AND owner_id=?").run(JSON.stringify(input.summary && typeof input.summary === "object" ? input.summary : {}), new Date().toISOString(), id, owner);
      if (Array.isArray(turns)) {
        const insert = db.prepare("INSERT OR IGNORE INTO conversation_coach_turns(id,session_id,owner_id,role,content,correction_json,created_at) VALUES(?,?,?,?,?,?,?)");
        for (const raw of turns as TurnInput[]) insert.run(typeof raw.id === "string" && raw.id ? raw.id : randomUUID(), id, owner, raw.role, raw.content.trim(), JSON.stringify(cleanCorrections(raw.corrections)), typeof raw.createdAt === "string" && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : new Date().toISOString());
        db.prepare("UPDATE conversation_coach_sessions SET updated_at=?,duration_seconds=? WHERE id=? AND owner_id=?").run(new Date().toISOString(), duration, id, owner);
      }
    });
    update();
    return respond({ session: loadSession(id, owner) }, req, owner);
  } catch (error) {
    console.error("Conversation coach update failed", error);
    return respond({ error: "Could not update this conversation in SQLite." }, req, owner, 503);
  }
}
export async function DELETE(req: NextRequest) {
  const owner = ownerFor(req);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return respond({ error: "Provide a session ID." }, req, owner, 400);
  try {
    schema();
    const result = getDatabase().prepare("DELETE FROM conversation_coach_sessions WHERE id=? AND owner_id=?").run(id, owner);
    return result.changes ? respond({ deleted: id }, req, owner) : respond({ error: "Conversation session not found." }, req, owner, 404);
  } catch (error) {
    console.error("Conversation coach delete failed", error);
    return respond({ error: "Could not delete this conversation." }, req, owner, 503);
  }
}
