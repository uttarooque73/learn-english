import { NextRequest, NextResponse } from "next/server";
import { AdaptiveLearningError } from "@/lib/ai/adaptive-learning";
import { runMultiAgentEvaluation } from "@/lib/ai/multi-agent-evaluation";
import { ModelProviderError } from "@/lib/ai/model-provider";
import { resolveOwnerId, synchronizeOwnerCookie } from "@/lib/request-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function ownerFor(request: NextRequest): string {
  return resolveOwnerId(request);
}

function respond(data: unknown, request: NextRequest, ownerId: string, status = 200): NextResponse {
  const response = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  return synchronizeOwnerCookie(response, request, ownerId);
}

function errorResponse(error: unknown, request: NextRequest, ownerId: string): NextResponse {
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
  return respond({ error: "The practice attempt could not be evaluated.", code: "evaluation_unavailable" }, request, ownerId, 500);
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
  if (typeof input.planItemId !== "string" || typeof input.responseText !== "string"
    || typeof input.durationSeconds !== "number" || typeof input.idempotencyKey !== "string") {
    return respond({
      error: "planItemId, responseText, durationSeconds, and idempotencyKey are required.",
      code: "invalid_input",
    }, request, ownerId, 400);
  }

  try {
    const workflow = await runMultiAgentEvaluation(ownerId, {
      planItemId: input.planItemId,
      responseText: input.responseText,
      durationSeconds: input.durationSeconds,
      idempotencyKey: input.idempotencyKey,
    });
    return respond({ attempt: workflow.attempt, workflow: { runId: workflow.runId, summary: workflow.summary, agents: workflow.agents } }, request, ownerId, workflow.attempt.duplicate ? 200 : 201);
  } catch (error) {
    return errorResponse(error, request, ownerId);
  }
}
