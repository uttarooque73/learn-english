import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AdaptiveLearningError, generateDailyLearningPlan, getCurrentLearningPlan } from "@/lib/ai/adaptive-learning";
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
    const plan = await generateDailyLearningPlan(ownerId, {
      dailyTargetMinutes: input.dailyTargetMinutes as number | undefined,
      goal: input.goal as string | undefined,
    });
    return respond({ plan }, request, ownerId, 201);
  } catch (error) {
    return errorResponse(error, request, ownerId);
  }
}
