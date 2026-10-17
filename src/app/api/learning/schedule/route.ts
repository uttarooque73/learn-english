import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

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

function readSchedule(ownerId: string) {
  const database = getDatabase();
  database.prepare("INSERT OR IGNORE INTO learner_profiles (owner_id) VALUES (?)").run(ownerId);
  const row = database.prepare(`
    SELECT timezone, daily_target_minutes AS dailyTargetMinutes,
      schedule_enabled AS scheduleEnabled, goals_json AS goalsJson
    FROM learner_profiles WHERE owner_id = ?
  `).get(ownerId) as {
    timezone: string; dailyTargetMinutes: number; scheduleEnabled: number; goalsJson: string;
  };
  let goals: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.goalsJson);
    if (Array.isArray(parsed)) goals = parsed.filter((goal): goal is string => typeof goal === "string").slice(0, 10);
  } catch { /* Return an empty list for invalid legacy JSON. */ }
  return {
    timezone: row.timezone,
    dailyTargetMinutes: row.dailyTargetMinutes,
    scheduleEnabled: row.scheduleEnabled === 1,
    goals,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  try {
    ensurePersistenceSchema();
    return respond({ schedule: readSchedule(ownerId) }, request, ownerId);
  } catch {
    return respond({ error: "Learning schedule is unavailable." }, request, ownerId, 500);
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
  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.scheduleEnabled !== undefined) {
    if (typeof input.scheduleEnabled !== "boolean") {
      return respond({ error: "scheduleEnabled must be a boolean.", code: "invalid_input" }, request, ownerId, 400);
    }
    updates.push("schedule_enabled = ?");
    values.push(input.scheduleEnabled ? 1 : 0);
  }
  if (input.timezone !== undefined) {
    if (typeof input.timezone !== "string" || input.timezone.length > 100) {
      return respond({ error: "timezone must be a valid IANA time zone.", code: "invalid_input" }, request, ownerId, 400);
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(new Date());
    } catch {
      return respond({ error: "timezone must be a valid IANA time zone.", code: "invalid_input" }, request, ownerId, 400);
    }
    updates.push("timezone = ?");
    values.push(input.timezone);
  }
  if (input.dailyTargetMinutes !== undefined) {
    if (typeof input.dailyTargetMinutes !== "number" || !Number.isInteger(input.dailyTargetMinutes)
      || input.dailyTargetMinutes < 5 || input.dailyTargetMinutes > 240) {
      return respond({ error: "dailyTargetMinutes must be an integer between 5 and 240.", code: "invalid_input" }, request, ownerId, 400);
    }
    updates.push("daily_target_minutes = ?");
    values.push(input.dailyTargetMinutes);
  }
  if (input.goal !== undefined) {
    if (typeof input.goal !== "string" || !input.goal.trim() || input.goal.length > 500) {
      return respond({ error: "goal must contain 1–500 characters.", code: "invalid_input" }, request, ownerId, 400);
    }
    updates.push("goals_json = ?");
    values.push(JSON.stringify([input.goal.trim()]));
  }
  if (!updates.length) return respond({ error: "No supported schedule fields were provided.", code: "invalid_input" }, request, ownerId, 400);

  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    database.prepare("INSERT OR IGNORE INTO learner_profiles (owner_id) VALUES (?)").run(ownerId);
    values.push(ownerId);
    database.prepare(`
      UPDATE learner_profiles SET ${updates.join(", ")},
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE owner_id = ?
    `).run(...values);
    return respond({ schedule: readSchedule(ownerId) }, request, ownerId);
  } catch {
    return respond({ error: "Learning schedule could not be saved." }, request, ownerId, 500);
  }
}
