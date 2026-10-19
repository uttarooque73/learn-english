import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { resolveOwnerId, synchronizeOwnerCookie } from "@/lib/request-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_KEY = "speakup:recommendation-feedback-v1";
const MAX_FEEDBACK_ITEMS = 30;
const MAX_ID_LENGTH = 140;
const MAX_TITLE_LENGTH = 180;
type FeedbackAction = "helpful" | "not_for_me";
type FeedbackItem = {
  recommendationId: string;
  title: string;
  action: FeedbackAction;
  createdAt: string;
};

function respond(data: unknown, request: NextRequest, ownerId: string, status = 200) {
  return synchronizeOwnerCookie(
    NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }),
    request,
    ownerId,
  );
}

function readFeedback(ownerId: string): FeedbackItem[] {
  const row = getDatabase().prepare(
    "SELECT data_value AS value FROM app_user_data WHERE owner_id = ? AND data_key = ?",
  ).get(ownerId, STORAGE_KEY) as { value: string } | undefined;
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is FeedbackItem => !!item && typeof item === "object"
      && typeof item.recommendationId === "string" && typeof item.title === "string"
      && (item.action === "helpful" || item.action === "not_for_me")
      && typeof item.createdAt === "string").slice(-MAX_FEEDBACK_ITEMS);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const ownerId = resolveOwnerId(request);
  try {
    ensurePersistenceSchema();
    return respond({ feedback: readFeedback(ownerId) }, request, ownerId);
  } catch {
    return respond({ error: "Recommendation feedback is temporarily unavailable." }, request, ownerId, 503);
  }
}

export async function POST(request: NextRequest) {
  const ownerId = resolveOwnerId(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Request body must be valid JSON." }, request, ownerId, 400);
  }
  if (!body || typeof body !== "object") {
    return respond({ error: "A JSON object is required." }, request, ownerId, 400);
  }
  const input = body as Record<string, unknown>;
  if (typeof input.recommendationId !== "string" || !input.recommendationId.trim()
    || input.recommendationId.length > MAX_ID_LENGTH
    || typeof input.title !== "string" || !input.title.trim() || input.title.length > MAX_TITLE_LENGTH
    || (input.action !== "helpful" && input.action !== "not_for_me")) {
    return respond({ error: "Provide a valid recommendation, title, and feedback action." }, request, ownerId, 400);
  }

  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    const item: FeedbackItem = {
      recommendationId: input.recommendationId.trim(),
      title: input.title.trim(),
      action: input.action,
      createdAt: new Date().toISOString(),
    };
    const save = database.transaction(() => {
      const current = readFeedback(ownerId);
      const updated = [...current, item].slice(-MAX_FEEDBACK_ITEMS);
      database.prepare(`
        INSERT INTO app_user_data (owner_id, data_key, data_value, updated_at)
        VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(owner_id, data_key) DO UPDATE SET
          data_value = excluded.data_value,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `).run(ownerId, STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    const feedback = save();
    return respond({ saved: true, feedback }, request, ownerId);
  } catch {
    return respond({ error: "Recommendation feedback could not be saved." }, request, ownerId, 503);
  }
}
