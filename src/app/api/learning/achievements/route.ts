import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { buildAchievementCards, type AchievementStats } from "@/lib/learning-achievements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const OWNER_COOKIE = "speakup_owner";

type AttemptRow = { completedAt: string; durationSeconds: number };
type CountRow = { count: number };
type EarnedRow = { achievementKey: string; earnedAt: string };

function dayKey(timestamp: string, timezone: string): string | null {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return dayKey(timestamp, "UTC");
  }
}

function streakStats(attempts: AttemptRow[], timezone: string): { currentStreak: number; longestStreak: number } {
  const days = [...new Set(attempts.map((attempt) => dayKey(attempt.completedAt, timezone)).filter((day): day is string => Boolean(day)))].sort();
  const daySet = new Set(days);
  let longestStreak = 0;
  let run = 0;
  let previous = 0;
  for (const day of days) {
    const current = Date.parse(day + "T00:00:00Z");
    run = previous && current - previous === 86_400_000 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = current;
  }
  const today = dayKey(new Date().toISOString(), timezone);
  const yesterdayDate = new Date();
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = dayKey(yesterdayDate.toISOString(), timezone);
  let currentStreak = 0;
  let cursor = daySet.has(today ?? "") ? today : daySet.has(yesterday ?? "") ? yesterday : null;
  while (cursor && daySet.has(cursor)) {
    currentStreak += 1;
    const previousDate = new Date(cursor + "T00:00:00Z");
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    cursor = previousDate.toISOString().slice(0, 10);
  }
  return { currentStreak, longestStreak };
}

function count(database: ReturnType<typeof getDatabase>, sql: string, ownerId: string): number {
  return (database.prepare(sql).get(ownerId) as CountRow).count ?? 0;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = request.cookies.get(OWNER_COOKIE)?.value ?? randomUUID();
  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    const profile = database.prepare("SELECT timezone FROM learner_profiles WHERE owner_id = ?")
      .get(ownerId) as { timezone: string } | undefined;
    const timezone = profile?.timezone || "UTC";
    const attempts = database.prepare(`
      SELECT completed_at AS completedAt, duration_seconds AS durationSeconds
      FROM practice_attempts WHERE owner_id = ? AND completed_at IS NOT NULL
      ORDER BY completed_at ASC
    `).all(ownerId) as AttemptRow[];
    const streaks = streakStats(attempts, timezone);
    const totalSeconds = attempts.reduce((sum, attempt) => sum + Math.max(0, attempt.durationSeconds || 0), 0);
    const vocabulary = database.prepare(`
      SELECT COUNT(*) AS reviews, COUNT(DISTINCT vocabulary_ref) AS uniqueWords
      FROM vocabulary_review_events WHERE owner_id = ?
    `).get(ownerId) as { reviews: number; uniqueWords: number };
    const stats: AchievementStats = {
      completedSessions: attempts.length,
      practiceMinutes: Math.floor(totalSeconds / 60),
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      uniqueVocabularyReviewed: vocabulary.uniqueWords,
      totalVocabularyReviews: vocabulary.reviews,
      highScoringAssessments: count(database, "SELECT COUNT(*) AS count FROM skill_assessments WHERE owner_id = ? AND score >= 0.85", ownerId),
      grammarAssessments: count(database, "SELECT COUNT(*) AS count FROM skill_assessments WHERE owner_id = ? AND lower(skill_key) LIKE '%grammar%'", ownerId),
      completedPlans: count(database, "SELECT COUNT(*) AS count FROM learning_plans WHERE owner_id = ? AND status = 'completed'", ownerId),
      resolvedMistakes: count(database, "SELECT COUNT(*) AS count FROM learning_mistakes WHERE owner_id = ? AND status = 'resolved'", ownerId),
      masteredSkills: count(database, "SELECT COUNT(*) AS count FROM learner_skill_scores WHERE owner_id = ? AND mastery >= 0.8", ownerId),
    };

    const cards = buildAchievementCards(stats);
    const saveAchievement = database.prepare(`
      INSERT OR IGNORE INTO learner_achievements (owner_id, achievement_key, evidence_json)
      VALUES (?, ?, ?)
    `);
    const saveEarned = database.transaction(() => {
      for (const card of cards) {
        if (card.value >= card.target) {
          saveAchievement.run(ownerId, card.key, JSON.stringify({ valueAtUnlock: card.value, target: card.target }));
        }
      }
    });
    saveEarned();

    const earnedRows = database.prepare(`
      SELECT achievement_key AS achievementKey, earned_at AS earnedAt
      FROM learner_achievements WHERE owner_id = ?
    `).all(ownerId) as EarnedRow[];
    const earnedAtByKey = new Map(earnedRows.map((row) => [row.achievementKey, row.earnedAt]));
    const achievements = buildAchievementCards(stats, earnedAtByKey);
    const response = NextResponse.json({
      summary: {
        unlockedCount: achievements.filter((achievement) => achievement.unlocked).length,
        totalCount: achievements.length,
        currentStreak: streaks.currentStreak,
        longestStreak: streaks.longestStreak,
        completedSessions: stats.completedSessions,
        practiceMinutes: stats.practiceMinutes,
      },
      achievements,
    }, { headers: { "Cache-Control": "no-store" } });
    if (!request.cookies.has(OWNER_COOKIE)) {
      response.cookies.set(OWNER_COOKIE, ownerId, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  } catch {
    const response = NextResponse.json({ error: "Learning achievements are unavailable." }, { status: 500, headers: { "Cache-Control": "no-store" } });
    if (!request.cookies.has(OWNER_COOKIE)) {
      response.cookies.set(OWNER_COOKIE, ownerId, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  }
}
