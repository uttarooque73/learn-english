import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const OWNER_COOKIE = "speakup_owner";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = request.cookies.get(OWNER_COOKIE)?.value ?? randomUUID();
  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    const skills = database.prepare(`
      SELECT skill_key AS skillKey, mastery, confidence, evidence_count AS evidenceCount, updated_at AS updatedAt
      FROM learner_skill_scores WHERE owner_id = ? ORDER BY mastery ASC, evidence_count DESC
    `).all(ownerId) as Array<{ skillKey: string; mastery: number; confidence: number; evidenceCount: number; updatedAt: string }>;
    const recentAttempts = database.prepare(`
      SELECT id, activity_type AS activityType, result_json AS resultJson, created_at AS createdAt, completed_at AS completedAt
      FROM practice_attempts WHERE owner_id = ? ORDER BY created_at DESC LIMIT 20
    `).all(ownerId) as Array<{ id: string; activityType: string; resultJson: string; createdAt: string; completedAt: string | null }>;
    const planRows = database.prepare(`
      SELECT id, local_date AS localDate, status, version, total_minutes AS totalMinutes, created_at AS createdAt
      FROM learning_plans WHERE owner_id = ? ORDER BY local_date DESC, version DESC LIMIT 10
    `).all(ownerId) as Array<{ id: string; localDate: string; status: string; version: number; totalMinutes: number; createdAt: string }>;
    const mistakeRows = database.prepare(`
      SELECT category, occurrence_count AS occurrenceCount, last_seen_at AS lastSeenAt
      FROM learning_mistakes WHERE owner_id = ? AND status = 'active'
      ORDER BY occurrence_count DESC, last_seen_at DESC LIMIT 10
    `).all(ownerId) as Array<{ category: string; occurrenceCount: number; lastSeenAt: string }>;
    const response = NextResponse.json({ skills, recentAttempts, plans: planRows, recurringMistakes: mistakeRows }, { headers: { "Cache-Control": "no-store" } });
    if (!request.cookies.has(OWNER_COOKIE)) response.cookies.set(OWNER_COOKIE, ownerId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return response;
  } catch {
    const response = NextResponse.json({ error: "Learning progress is unavailable." }, { status: 500, headers: { "Cache-Control": "no-store" } });
    if (!request.cookies.has(OWNER_COOKIE)) response.cookies.set(OWNER_COOKIE, ownerId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return response;
  }
}
