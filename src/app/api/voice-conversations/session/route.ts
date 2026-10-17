import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ownerFor(request: NextRequest): string {
  return request.cookies.get("speakup_owner")?.value ?? randomUUID();
}
function respond(data: unknown, request: NextRequest, ownerId: string, status = 200): NextResponse {
  const result = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.cookies.has("speakup_owner")) result.cookies.set("speakup_owner", ownerId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return result;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  let body: unknown;
  try { body = await request.json(); } catch { return respond({ error: "Request body must be valid JSON." }, request, ownerId, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "A JSON object is required." }, request, ownerId, 400);
  const input = body as Record<string, unknown>;
  if (typeof input.sessionId !== "string" || input.sessionId.length > 100
    || typeof input.topic !== "string" || input.topic.length > 120
    || !["Beginner", "Intermediate", "Advanced"].includes(String(input.proficiency))
    || typeof input.startedAt !== "string"
    || !input.message || typeof input.message !== "object") return respond({ error: "Invalid session or message details." }, request, ownerId, 400);
  const message = input.message as Record<string, unknown>;
  const messageContent = message.content;
  if (typeof message.id !== "string" || message.id.length > 100
    || !["user", "assistant"].includes(String(message.role))
    || typeof messageContent !== "string" || !messageContent.trim() || messageContent.length > 4000
    || typeof message.createdAt !== "string" || typeof input.sequenceNumber !== "number"
    || !Number.isInteger(input.sequenceNumber) || input.sequenceNumber < 0) {
    return respond({ error: "Invalid transcript message." }, request, ownerId, 400);
  }
  try {
    ensurePersistenceSchema();
    const db = getDatabase();
    const existing = db.prepare("SELECT owner_id FROM voice_conversation_sessions WHERE id=?").get(input.sessionId) as { owner_id: string } | undefined;
    if (existing && existing.owner_id !== ownerId) return respond({ error: "Conversation not found." }, request, ownerId, 404);
    const save = db.transaction(() => {
      db.prepare(`INSERT INTO voice_conversation_sessions (id, owner_id, topic, proficiency, status, started_at, feedback_status)
        VALUES (?, ?, ?, ?, 'active', ?, 'pending')
        ON CONFLICT(id) DO UPDATE SET topic=excluded.topic, proficiency=excluded.proficiency
        WHERE voice_conversation_sessions.owner_id=excluded.owner_id`)
        .run(input.sessionId, ownerId, input.topic, input.proficiency, input.startedAt);
      db.prepare(`INSERT INTO voice_conversation_messages (id, session_id, owner_id, sequence_number, role, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, id) DO UPDATE SET content=excluded.content
        WHERE voice_conversation_messages.owner_id=excluded.owner_id`)
        .run(message.id, input.sessionId, ownerId, input.sequenceNumber, message.role, messageContent.trim(), message.createdAt);
    });
    save();
    return respond({ saved: true }, request, ownerId);
  } catch { return respond({ error: "Transcript could not be saved." }, request, ownerId, 500); }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  try {
    ensurePersistenceSchema();
    const db = getDatabase();
    const sessions = db.prepare(`SELECT id, topic, proficiency, status, started_at AS startedAt, ended_at AS endedAt,
      duration_seconds AS durationSeconds, feedback_status AS feedbackStatus
      FROM voice_conversation_sessions WHERE owner_id=? ORDER BY started_at DESC LIMIT 50`).all(ownerId);
    return respond({ sessions }, request, ownerId);
  } catch { return respond({ error: "Conversation history could not be loaded." }, request, ownerId, 500); }
}
