import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabasePool } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "speakup_owner";
const MAX_KEY_LENGTH = 160;
const MAX_VALUE_LENGTH = 2_000_000;

function ownerFor(request: NextRequest) {
  return request.cookies.get(COOKIE_NAME)?.value || randomUUID();
}

function withOwnerCookie(response: NextResponse, request: NextRequest, owner: string) {
  if (!request.cookies.has(COOKIE_NAME)) {
    response.cookies.set(COOKIE_NAME, owner, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

function databaseError(error: unknown) {
  console.error("SpeakUp persistence error:", error);
  return NextResponse.json({
    error: process.env.NODE_ENV === "production"
      ? "Persistent storage is temporarily unavailable. Check the database configuration."
      : error instanceof Error ? error.message : "Database unavailable.",
  }, { status: 503 });
}

export async function GET(request: NextRequest) {
  const owner = ownerFor(request);
  try {
    await ensurePersistenceSchema();
    const result = await getDatabasePool().query(
      "SELECT data_key AS key, data_value AS value FROM app_user_data WHERE owner_id = $1 ORDER BY data_key",
      [owner],
    );
    return withOwnerCookie(NextResponse.json({ entries: result.rows }), request, owner);
  } catch (error) {
    return databaseError(error);
  }
}

export async function POST(request: NextRequest) {
  const owner = ownerFor(request);
  let body: unknown;
  try { body = await request.json(); }
  catch { return withOwnerCookie(NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }), request, owner); }

  if (!body || typeof body !== "object") {
    return withOwnerCookie(NextResponse.json({ error: "A JSON object is required." }, { status: 400 }), request, owner);
  }
  const { key, value } = body as Record<string, unknown>;
  if (typeof key !== "string" || !key.trim() || key.length > MAX_KEY_LENGTH
    || typeof value !== "string" || value.length > MAX_VALUE_LENGTH) {
    return withOwnerCookie(NextResponse.json({ error: "Invalid storage key or value; values must be strings under 2 MB." }, { status: 400 }), request, owner);
  }

  try {
    await ensurePersistenceSchema();
    await getDatabasePool().query(
      `INSERT INTO app_user_data (owner_id, data_key, data_value, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (owner_id, data_key)
       DO UPDATE SET data_value = EXCLUDED.data_value, updated_at = NOW()`,
      [owner, key, JSON.stringify(value)],
    );
    return withOwnerCookie(NextResponse.json({ saved: true }), request, owner);
  } catch (error) {
    return withOwnerCookie(databaseError(error), request, owner);
  }
}

export async function DELETE(request: NextRequest) {
  const owner = ownerFor(request);
  const key = request.nextUrl.searchParams.get("key");
  if (key && key.length > MAX_KEY_LENGTH) {
    return withOwnerCookie(NextResponse.json({ error: "Invalid storage key." }, { status: 400 }), request, owner);
  }
  try {
    await ensurePersistenceSchema();
    if (key) {
      await getDatabasePool().query("DELETE FROM app_user_data WHERE owner_id = $1 AND data_key = $2", [owner, key]);
    } else {
      await getDatabasePool().query("DELETE FROM app_user_data WHERE owner_id = $1", [owner]);
    }
    return withOwnerCookie(NextResponse.json({ deleted: true }), request, owner);
  } catch (error) {
    return withOwnerCookie(databaseError(error), request, owner);
  }
}
