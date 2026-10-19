import { NextRequest, NextResponse } from "next/server";
import { createTutorConversation, deleteTutorConversation, getTutorConversation } from "@/lib/ai/tutor-memory";
import { resolveOwnerId, synchronizeOwnerCookie } from "@/lib/request-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOALS = new Set([
  "Speak more confidently", "Improve grammar", "Expand vocabulary",
  "Practice workplace English", "Prepare for an interview", "Improve fluency",
]);
const LEVELS = new Set(["Beginner", "Intermediate", "Advanced"]);
const FEEDBACK_STYLES = new Set(["balanced", "detailed"]);

function respond(data: unknown, request: NextRequest, ownerId: string, status = 200) {
  return synchronizeOwnerCookie(
    NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }),
    request,
    ownerId,
  );
}

export async function GET(request: NextRequest) {
  const ownerId = resolveOwnerId(request);
  try {
    const id = request.nextUrl.searchParams.get("id") ?? undefined;
    if (id !== undefined && (!/^[0-9a-f-]{36}$/i.test(id))) {
      return respond({ error: "Invalid conversation id." }, request, ownerId, 400);
    }
    return respond({ conversation: getTutorConversation(ownerId, id) }, request, ownerId);
  } catch {
    return respond({ error: "Tutor history is temporarily unavailable." }, request, ownerId, 503);
  }
}

export async function POST(request: NextRequest) {
  const ownerId = resolveOwnerId(request);
  let body: unknown;
  try { body = await request.json(); }
  catch { return respond({ error: "Request body must be valid JSON." }, request, ownerId, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond({ error: "A JSON object is required." }, request, ownerId, 400);
  }
  const payload = body as Record<string, unknown>;
  const goal = typeof payload.goal === "string" && GOALS.has(payload.goal) ? payload.goal : "Speak more confidently";
  const level = typeof payload.level === "string" && LEVELS.has(payload.level) ? payload.level : "Intermediate";
  const feedbackStyle = typeof payload.feedbackStyle === "string" && FEEDBACK_STYLES.has(payload.feedbackStyle) ? payload.feedbackStyle : "balanced";
  try {
    const conversation = createTutorConversation(ownerId, { goal, level, feedbackStyle });
    return respond({ conversation }, request, ownerId, 201);
  } catch {
    return respond({ error: "A new tutor session could not be created." }, request, ownerId, 503);
  }
}

export async function DELETE(request: NextRequest) {
  const ownerId = resolveOwnerId(request);
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return respond({ error: "A valid conversation id is required." }, request, ownerId, 400);
  }
  try {
    const deleted = deleteTutorConversation(ownerId, id);
    return respond(deleted ? { deleted: true } : { error: "Conversation not found." }, request, ownerId, deleted ? 200 : 404);
  } catch {
    return respond({ error: "Tutor history could not be deleted." }, request, ownerId, 503);
  }
}
