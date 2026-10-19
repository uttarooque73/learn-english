import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { resolveOwnerId, synchronizeOwnerCookie } from "@/lib/request-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_KEY = "speakup:daily-speaking-missions-v1";
const MAX_HISTORY = 60;
const MAX_REFLECTION_LENGTH = 500;

type MissionCompletion = {
  date: string;
  missionId: string;
  title: string;
  reflection: string;
  completedAt: string;
};

function respond(data: unknown, request: NextRequest, ownerId: string, status = 200) {
  return synchronizeOwnerCookie(
    NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }),
    request,
    ownerId,
  );
}

function readHistory(ownerId: string): MissionCompletion[] {
  const row = getDatabase().prepare(
    "SELECT data_value AS value FROM app_user_data WHERE owner_id = ? AND data_key = ?",
  ).get(ownerId, STORAGE_KEY) as { value: string } | undefined;
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MissionCompletion => Boolean(item && typeof item === "object"
      && typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
      && typeof item.missionId === "string" && typeof item.title === "string"
      && typeof item.reflection === "string" && typeof item.completedAt === "string"))
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = resolveOwnerId(request);
  try {
    ensurePersistenceSchema();
    return respond({ history: readHistory(ownerId) }, request, ownerId);
  } catch {
    return respond({ error: "Daily speaking mission history is temporarily unavailable." }, request, ownerId, 503);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ownerId = resolveOwnerId(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Request body must be valid JSON." }, request, ownerId, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond({ error: "A JSON object is required." }, request, ownerId, 400);
  }
  const input = body as Record<string, unknown>;
  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
    || typeof input.missionId !== "string" || !/^[a-z0-9-]{1,80}$/.test(input.missionId)
    || typeof input.title !== "string" || !input.title.trim() || input.title.length > 180
    || typeof input.reflection !== "string" || input.reflection.length > MAX_REFLECTION_LENGTH
    || typeof input.completedAt !== "string" || !Number.isFinite(Date.parse(input.completedAt))) {
    return respond({ error: "Provide a valid mission date, identifier, title, reflection, and completion time." }, request, ownerId, 400);
  }

  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    const completion: MissionCompletion = {
      date: input.date,
      missionId: input.missionId,
      title: input.title.trim(),
      reflection: input.reflection.trim(),
      completedAt: new Date(input.completedAt).toISOString(),
    };
    const save = database.transaction(() => {
      const next = [...readHistory(ownerId).filter((item) => item.date !== completion.date), completion].slice(-MAX_HISTORY);
      database.prepare(`
        INSERT INTO app_user_data (owner_id, data_key, data_value, updated_at)
        VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(owner_id, data_key) DO UPDATE SET
          data_value = excluded.data_value,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `).run(ownerId, STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    return respond({ saved: true, history: save() }, request, ownerId);
  } catch {
    return respond({ error: "Daily speaking mission could not be saved." }, request, ownerId, 503);
  }
}
