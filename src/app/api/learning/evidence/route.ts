import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  AdaptiveLearningError,
  recordPracticeEvidence,
  type LearningEvidenceRequest,
} from "@/lib/ai/adaptive-learning";

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

  try {
    const result = recordPracticeEvidence(ownerId, body as LearningEvidenceRequest);
    return respond({ evidence: result }, request, ownerId, result.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof AdaptiveLearningError) {
      const status = error.code === "invalid_owner" || error.code === "invalid_input" ? 400 : 422;
      return respond({ error: error.message, code: error.code }, request, ownerId, status);
    }
    return respond({
      error: "Learning evidence could not be saved.",
      code: "evidence_unavailable",
    }, request, ownerId, 500);
  }
}
