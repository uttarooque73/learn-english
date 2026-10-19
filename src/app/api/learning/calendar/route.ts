import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { buildLearningCalendar, localDateKey, localMonthKey, type CalendarActivity } from "@/lib/learning-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const OWNER_COOKIE = "speakup_owner";
const MAX_HISTORY_DAYS = 800;

type PracticeRow = { completedAt: string; durationSeconds: number };
type VocabularyRow = { createdAt: string };
type AssessmentRow = { createdAt: string; score: number };

function monthIsAllowed(month: string, currentMonth: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return false;
  const selected = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
  const current = Number(currentMonth.slice(0, 4)) * 12 + Number(currentMonth.slice(5, 7));
  return selected <= current && selected >= current - 24;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = request.cookies.get(OWNER_COOKIE)?.value ?? randomUUID();
  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    const profile = database.prepare("SELECT timezone FROM learner_profiles WHERE owner_id = ?")
      .get(ownerId) as { timezone: string } | undefined;
    const timezone = profile?.timezone || "UTC";
    const now = new Date();
    const currentMonth = localMonthKey(now, timezone);
    const requestedMonth = request.nextUrl.searchParams.get("month") ?? currentMonth;
    if (!monthIsAllowed(requestedMonth, currentMonth)) {
      return NextResponse.json({ error: "Choose a month within the last 24 months, up to the current month." }, { status: 400 });
    }
    const cutoff = new Date(now.getTime() - MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const practices = database.prepare(`
      SELECT completed_at AS completedAt, duration_seconds AS durationSeconds
      FROM practice_attempts WHERE owner_id = ? AND completed_at IS NOT NULL AND completed_at >= ?
      ORDER BY completed_at ASC
    `).all(ownerId, cutoff) as PracticeRow[];
    const vocabulary = database.prepare(`
      SELECT created_at AS createdAt FROM vocabulary_review_events
      WHERE owner_id = ? AND created_at >= ? ORDER BY created_at ASC
    `).all(ownerId, cutoff) as VocabularyRow[];
    const assessments = database.prepare(`
      SELECT created_at AS createdAt, score FROM skill_assessments
      WHERE owner_id = ? AND created_at >= ? ORDER BY created_at ASC
    `).all(ownerId, cutoff) as AssessmentRow[];

    const activities: CalendarActivity[] = [];
    for (const row of practices) {
      const date = localDateKey(row.completedAt, timezone);
      if (date) activities.push({ date, kind: "practice", durationSeconds: row.durationSeconds });
    }
    for (const row of vocabulary) {
      const date = localDateKey(row.createdAt, timezone);
      if (date) activities.push({ date, kind: "vocabulary" });
    }
    for (const row of assessments) {
      const date = localDateKey(row.createdAt, timezone);
      if (date) activities.push({ date, kind: "assessment", score: row.score });
    }

    const calendar = buildLearningCalendar(requestedMonth, timezone, activities, now);
    const response = NextResponse.json(calendar, { headers: { "Cache-Control": "no-store" } });
    if (!request.cookies.has(OWNER_COOKIE)) {
      response.cookies.set(OWNER_COOKIE, ownerId, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  } catch {
    const response = NextResponse.json({ error: "Your learning calendar is temporarily unavailable." }, { status: 500, headers: { "Cache-Control": "no-store" } });
    if (!request.cookies.has(OWNER_COOKIE)) {
      response.cookies.set(OWNER_COOKIE, ownerId, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  }
}
