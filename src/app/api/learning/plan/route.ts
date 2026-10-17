import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AdaptiveLearningError, getCurrentLearningPlan, recordPracticeEvidence, type ActivityType, type EvidenceSource } from "@/lib/ai/adaptive-learning";
import { MultiAgentLearningError, runMultiAgentLearningWorkflow } from "@/lib/ai/multi-agent-learning";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { ModelProviderError } from "@/lib/ai/model-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const OWNER_COOKIE = "speakup_owner";

function ownerFor(request: NextRequest): string {
  return request.cookies.get(OWNER_COOKIE)?.value ?? randomUUID();
}

function respond(data: unknown, request: NextRequest, ownerId: string, status = 200): NextResponse {
  const response = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.cookies.has(OWNER_COOKIE)) {
    response.cookies.set(OWNER_COOKIE, ownerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

function errorResponse(error: unknown, request: NextRequest, ownerId: string): NextResponse {
  if (error instanceof MultiAgentLearningError) {
    const status = error.code === "invalid_owner" || error.code === "invalid_input" ? 400 : 500;
    return respond({ error: error.message, code: error.code }, request, ownerId, status);
  }
  if (error instanceof AdaptiveLearningError) {
    const status = error.code === "plan_not_found" ? 404
      : error.code === "invalid_owner" || error.code === "invalid_input" ? 400 : 422;
    return respond({ error: error.message, code: error.code }, request, ownerId, status);
  }
  if (error instanceof ModelProviderError) {
    const status = error.code === "invalid_request" ? 400 : 503;
    return respond({
      error: error.message,
      code: error.code,
      retryable: error.code === "timeout" || error.code === "provider_unavailable",
    }, request, ownerId, status);
  }
  return respond({ error: "The learning plan could not be processed.", code: "learning_plan_unavailable" }, request, ownerId, 500);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  try {
    return respond({ plan: getCurrentLearningPlan(ownerId) }, request, ownerId);
  } catch (error) {
    return errorResponse(error, request, ownerId);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Request body must be valid JSON.", code: "invalid_json" }, request, ownerId, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond({ error: "A JSON object is required.", code: "invalid_input" }, request, ownerId, 400);
  }

  const input = body as Record<string, unknown>;
  if ((input.dailyTargetMinutes !== undefined && typeof input.dailyTargetMinutes !== "number")
    || (input.goal !== undefined && typeof input.goal !== "string")) {
    return respond({ error: "dailyTargetMinutes must be a number and goal must be a string.", code: "invalid_input" }, request, ownerId, 400);
  }

  try {
    const workflow = await runMultiAgentLearningWorkflow(ownerId, {
      dailyTargetMinutes: input.dailyTargetMinutes as number | undefined,
      goal: input.goal as string | undefined,
    });
    return respond({ plan: workflow.plan, workflow: { runId: workflow.runId, diagnosis: workflow.diagnosis, summary: workflow.summary, agents: workflow.agents } }, request, ownerId, 201);
  } catch (error) {
    return errorResponse(error, request, ownerId);
  }
}


export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Request body must be valid JSON.", code: "invalid_json" }, request, ownerId, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond({ error: "A JSON object is required.", code: "invalid_input" }, request, ownerId, 400);
  }
  const input = body as Record<string, unknown>;
  if (typeof input.planItemId !== "string" || !input.planItemId.trim()
    || !["pending", "in_progress", "completed", "skipped"].includes(String(input.status))) {
    return respond({ error: "planItemId and a valid item status are required.", code: "invalid_input" }, request, ownerId, 400);
  }

  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    const item = database.prepare(`
      SELECT id, plan_id AS planId, activity_type AS activityType, activity_ref AS activityRef, skill_key AS skillKey
      FROM learning_plan_items WHERE id = ? AND owner_id = ?
    `).get(input.planItemId, ownerId) as {
      id: string; planId: string; activityType: ActivityType; activityRef: string | null; skillKey: string | null;
    } | undefined;
    if (!item) return respond({ error: "Learning plan item not found.", code: "plan_not_found" }, request, ownerId, 404);

    const status = input.status as "pending" | "in_progress" | "completed" | "skipped";
    const update = database.transaction(() => {
      database.prepare(`
        UPDATE learning_plan_items SET status = ? WHERE id = ? AND owner_id = ?
      `).run(status, item.id, ownerId);

      if (status === "completed") {
        const source: EvidenceSource = item.activityType === "vocabulary" ? "vocabulary"
          : item.activityType === "shadowing" ? "shadowing"
            : item.activityType === "listening" ? "listening"
              : item.activityType === "fluency" ? "fluency"
                : item.activityType === "grammar" ? "micro_lesson" : "conversation";
        recordPracticeEvidence(ownerId, {
          planItemId: item.id,
          source,
          activityType: item.activityType,
          activityRef: item.activityRef ?? item.activityType,
          skillKey: item.skillKey ?? (item.activityType === "vocabulary" ? "vocabulary"
            : item.activityType === "grammar" ? "grammar"
              : item.activityType === "listening" ? "listening"
                : item.activityType === "shadowing" ? "pronunciation"
                  : item.activityType === "fluency" ? "fluency" : "speaking"),
          durationSeconds: 0,
          idempotencyKey: `plan-item-completion:${item.id}:v1`,
          feedback: "Learner marked this planned activity complete.",
        });
      }

      database.prepare(`
        UPDATE learning_plans SET
          status = CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM learning_plan_items
              WHERE plan_id = ? AND owner_id = ? AND status IN ('pending', 'in_progress')
            ) THEN 'completed'
            ELSE 'published'
          END,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND owner_id = ?
      `).run(item.planId, ownerId, item.planId, ownerId);
    });
    update();
    return respond({ saved: true, plan: getCurrentLearningPlan(ownerId) }, request, ownerId);
  } catch (error) {
    return errorResponse(error, request, ownerId);
  }
}
