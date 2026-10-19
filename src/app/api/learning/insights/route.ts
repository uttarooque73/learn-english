import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { buildSkillTrends, type CurrentSkillEstimate, type SkillAssessmentPoint } from "@/lib/learning-insights";
import { resolveOwnerId, synchronizeOwnerCookie } from "@/lib/request-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    ensurePersistenceSchema();
    const database = getDatabase();
    const assessments = database.prepare(`
      SELECT skill_key AS skillKey, score, confidence, created_at AS createdAt
      FROM skill_assessments
      WHERE owner_id = ?
      ORDER BY created_at DESC
      LIMIT 250
    `).all(ownerId) as SkillAssessmentPoint[];
    const currentSkills = database.prepare(`
      SELECT skill_key AS skillKey, mastery, confidence, evidence_count AS evidenceCount,
        updated_at AS updatedAt
      FROM learner_skill_scores
      WHERE owner_id = ?
    `).all(ownerId) as CurrentSkillEstimate[];
    const recurringMistakes = database.prepare(`
      SELECT category, occurrence_count AS occurrenceCount, last_seen_at AS lastSeenAt
      FROM learning_mistakes
      WHERE owner_id = ? AND status = 'active'
      ORDER BY occurrence_count DESC, last_seen_at DESC
      LIMIT 5
    `).all(ownerId) as Array<{ category: string; occurrenceCount: number; lastSeenAt: string }>;

    const skillTrends = buildSkillTrends(assessments, currentSkills);
    const strongestSkill = [...skillTrends]
      .filter((skill) => skill.evidenceCount > 0)
      .sort((left, right) => right.mastery - left.mastery)[0] ?? null;
    const focusSkill = skillTrends.find((skill) => skill.evidenceCount > 0) ?? null;
    const now = Date.now();
    const assessmentsLast28Days = assessments.filter((item) => {
      const time = Date.parse(item.createdAt);
      return Number.isFinite(time) && time >= now - 28 * 24 * 60 * 60 * 1000;
    }).length;

    return respond({
      skillTrends,
      strongestSkill: strongestSkill ? strongestSkill.skillKey : null,
      focusSkill: focusSkill ? focusSkill.skillKey : null,
      activeSkillsCount: skillTrends.filter((skill) => skill.evidenceCount > 0).length,
      assessmentsLast28Days,
      evidenceWindow: "latest 250 saved skill assessments; trends use the last eight UTC weeks",
      recurringMistakes,
    }, request, ownerId);
  } catch {
    return respond({ error: "Learning insights are temporarily unavailable." }, request, ownerId, 503);
  }
}
