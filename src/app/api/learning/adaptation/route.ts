import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { getAdaptiveLearningPolicy } from "@/lib/ai/adaptive-learning";

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
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  try {
    return respond({ policy: getAdaptiveLearningPolicy(ownerId) }, request, ownerId);
  } catch {
    return respond({ error: "Adaptive learning settings are unavailable." }, request, ownerId, 500);
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
  if ((input.adaptationEnabled !== undefined && typeof input.adaptationEnabled !== "boolean")
    || (input.reviewIntervalScale !== undefined
      && (typeof input.reviewIntervalScale !== "number" || !Number.isFinite(input.reviewIntervalScale)
        || input.reviewIntervalScale < 0.5 || input.reviewIntervalScale > 2))) {
    return respond({
      error: "adaptationEnabled must be boolean and reviewIntervalScale must be between 0.5 and 2.",
      code: "invalid_input",
    }, request, ownerId, 400);
  }
  if (input.adaptationEnabled === undefined && input.reviewIntervalScale === undefined) {
    return respond({ error: "No supported adaptation setting was provided.", code: "invalid_input" }, request, ownerId, 400);
  }

  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    database.prepare("INSERT OR IGNORE INTO learner_profiles (owner_id) VALUES (?)").run(ownerId);
    database.prepare("INSERT OR IGNORE INTO learner_adaptation_settings (owner_id) VALUES (?)").run(ownerId);
    const updates: string[] = [];
    const values: unknown[] = [];
    if (input.adaptationEnabled !== undefined) {
      updates.push("enabled = ?");
      values.push(input.adaptationEnabled ? 1 : 0);
    }
    if (input.reviewIntervalScale !== undefined) {
      updates.push("review_interval_scale = ?");
      values.push(input.reviewIntervalScale);
    }
    updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    values.push(ownerId);
    database.prepare(`UPDATE learner_adaptation_settings SET ${updates.join(", ")} WHERE owner_id = ?`).run(...values);
    return respond({ policy: getAdaptiveLearningPolicy(ownerId) }, request, ownerId);
  } catch {
    return respond({ error: "Adaptive learning settings could not be saved." }, request, ownerId, 500);
  }
}
