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
function readPreferences(ownerId: string) {
  const row = getDatabase().prepare(`SELECT sentence_feedback_enabled AS sentenceFeedbackEnabled,
    repeat_after_feedback_enabled AS repeatAfterFeedbackEnabled
    FROM voice_conversation_preferences WHERE owner_id=?`).get(ownerId) as
    { sentenceFeedbackEnabled: number; repeatAfterFeedbackEnabled: number } | undefined;
  return {
    sentenceFeedbackEnabled: row ? Boolean(row.sentenceFeedbackEnabled) : true,
    repeatAfterFeedbackEnabled: row ? Boolean(row.repeatAfterFeedbackEnabled) : true,
  };
}
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  try {
    ensurePersistenceSchema();
    return respond(readPreferences(ownerId), request, ownerId);
  } catch {
    return respond({ error: "Conversation preferences could not be loaded." }, request, ownerId, 500);
  }
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  let body: unknown;
  try { body = await request.json(); } catch { return respond({ error: "Request body must be valid JSON." }, request, ownerId, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "A JSON object is required." }, request, ownerId, 400);
  const input = body as Record<string, unknown>;
  if (typeof input.sentenceFeedbackEnabled !== "boolean" || typeof input.repeatAfterFeedbackEnabled !== "boolean") {
    return respond({ error: "Both conversation preference values must be boolean." }, request, ownerId, 400);
  }
  try {
    ensurePersistenceSchema();
    getDatabase().prepare(`INSERT INTO voice_conversation_preferences
      (owner_id, sentence_feedback_enabled, repeat_after_feedback_enabled, updated_at)
      VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(owner_id) DO UPDATE SET sentence_feedback_enabled=excluded.sentence_feedback_enabled,
      repeat_after_feedback_enabled=excluded.repeat_after_feedback_enabled, updated_at=excluded.updated_at`)
      .run(ownerId, input.sentenceFeedbackEnabled ? 1 : 0, input.repeatAfterFeedbackEnabled ? 1 : 0);
    return respond(readPreferences(ownerId), request, ownerId);
  } catch {
    return respond({ error: "Conversation preferences could not be saved." }, request, ownerId, 500);
  }
}
