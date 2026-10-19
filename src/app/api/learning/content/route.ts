import { NextRequest, NextResponse } from "next/server";
import { generateLearningActivity, isDynamicActivityType, type GenerateActivityInput } from "@/lib/ai/activity-content";
import { ModelProviderError } from "@/lib/ai/model-provider";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const ownerId = resolveOwnerId(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Request body must be valid JSON.", code: "invalid_json" }, request, ownerId, 400);
  }
  if (!isRecord(body) || !isDynamicActivityType(body.activityType)) {
    return respond({
      error: "activityType must be conversation, vocabulary, grammar, pronunciation, listening, fluency, or real-world-challenge.",
      code: "invalid_activity_type",
    }, request, ownerId, 400);
  }

  const input: GenerateActivityInput = {
    activityType: body.activityType,
    topic: typeof body.topic === "string" ? body.topic : undefined,
    goal: typeof body.goal === "string" ? body.goal : undefined,
    proficiencyLevel: typeof body.proficiencyLevel === "string" ? body.proficiencyLevel : undefined,
    focusSkill: typeof body.focusSkill === "string" ? body.focusSkill : undefined,
    quantity: typeof body.quantity === "number" ? body.quantity : undefined,
  };

  try {
    ensurePersistenceSchema();
    const profile = getDatabase().prepare(
      "SELECT proficiency_level AS proficiencyLevel, goals_json AS goalsJson FROM learner_profiles WHERE owner_id = ?",
    ).get(ownerId) as { proficiencyLevel: string; goalsJson: string } | undefined;

    if (!input.proficiencyLevel && profile?.proficiencyLevel) {
      input.proficiencyLevel = profile.proficiencyLevel;
    }
    if (!input.goal && profile?.goalsJson) {
      try {
        const goals: unknown = JSON.parse(profile.goalsJson);
        if (Array.isArray(goals)) {
          input.goal = goals.filter((goal): goal is string => typeof goal === "string").slice(0, 3).join("; ");
        }
      } catch {
        // Invalid legacy preferences are ignored; generation uses the neutral default.
      }
    }

    const activity = await generateLearningActivity(input);
    return respond({ activity }, request, ownerId, 201);
  } catch (error) {
    if (error instanceof ModelProviderError) {
      const status = error.code === "invalid_request" ? 400
        : error.code === "provider_unavailable" || error.code === "timeout" ? 503 : 502;
      return respond({
        error: error.message,
        code: error.code,
        retryable: error.code === "timeout" || error.code === "provider_unavailable",
      }, request, ownerId, status);
    }
    if (error instanceof Error && /supported|quantity|too long|requested number/i.test(error.message)) {
      return respond({ error: error.message, code: "invalid_input" }, request, ownerId, 400);
    }
    return respond({
      error: error instanceof Error ? error.message : "Could not generate this learning activity.",
      code: "activity_generation_failed",
    }, request, ownerId, 502);
  }
}
