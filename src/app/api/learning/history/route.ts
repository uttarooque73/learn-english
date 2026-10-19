import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { buildLearningHistory } from "@/lib/learning-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const OWNER_COOKIE = "speakup_owner";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = request.cookies.get(OWNER_COOKIE)?.value ?? randomUUID();
  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    const practices = database.prepare(`
      SELECT id, activity_type AS activityType, activity_ref AS activityRef,
        result_json AS resultJson, response_json AS responseJson,
        duration_seconds AS durationSeconds, created_at AS createdAt, completed_at AS completedAt
      FROM practice_attempts
      WHERE owner_id = ? AND completed_at IS NOT NULL
      ORDER BY completed_at DESC LIMIT 100
    `).all(ownerId) as Parameters<typeof buildLearningHistory>[0];
    const assessments = database.prepare(`
      SELECT id, skill_key AS skillKey, score, evidence_json AS evidenceJson, created_at AS createdAt
      FROM skill_assessments WHERE owner_id = ?
      ORDER BY created_at DESC LIMIT 50
    `).all(ownerId) as Parameters<typeof buildLearningHistory>[1];
    const reviews = database.prepare(`
      SELECT id, vocabulary_ref AS vocabularyRef, recall_rating AS recallRating,
        interval_days AS intervalDays, next_due_at AS nextDueAt, created_at AS createdAt
      FROM vocabulary_review_events WHERE owner_id = ?
      ORDER BY created_at DESC LIMIT 50
    `).all(ownerId) as Parameters<typeof buildLearningHistory>[2];
    const items = buildLearningHistory(practices, assessments, reviews);
    const response = NextResponse.json({ items, count: items.length }, { headers: { "Cache-Control": "no-store" } });
    if (!request.cookies.has(OWNER_COOKIE)) {
      response.cookies.set(OWNER_COOKIE, ownerId, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  } catch {
    const response = NextResponse.json({ error: "Learning history is temporarily unavailable." }, { status: 500, headers: { "Cache-Control": "no-store" } });
    if (!request.cookies.has(OWNER_COOKIE)) {
      response.cookies.set(OWNER_COOKIE, ownerId, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  }
}
