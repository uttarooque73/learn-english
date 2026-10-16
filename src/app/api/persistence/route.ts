import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

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

function databaseError(error: unknown, request: NextRequest, owner: string) {
  console.error("SpeakUp SQLite persistence error:", error);
  const response = NextResponse.json({
    error: process.env.NODE_ENV === "production"
      ? "Persistent storage is temporarily unavailable. Check the SQLite database path and file permissions."
      : error instanceof Error ? error.message : "Database unavailable.",
  }, { status: 503 });
  return withOwnerCookie(response, request, owner);
}

export async function GET(request: NextRequest) {
  const owner = ownerFor(request);
  try {
    ensurePersistenceSchema();
    const entries = getDatabase()
      .prepare("SELECT data_key AS key, data_value AS value FROM app_user_data WHERE owner_id = ? ORDER BY data_key")
      .all(owner);
    return withOwnerCookie(NextResponse.json({ entries }), request, owner);
  } catch (error) {
    return databaseError(error, request, owner);
  }
}

export async function POST(request: NextRequest) {
  const owner = ownerFor(request);
  let body: unknown;
  try { body = await request.json(); }
  catch {
    return withOwnerCookie(NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }), request, owner);
  }

  if (!body || typeof body !== "object") {
    return withOwnerCookie(NextResponse.json({ error: "A JSON object is required." }, { status: 400 }), request, owner);
  }
  const { key, value } = body as Record<string, unknown>;
  if (typeof key !== "string" || !key.trim() || key.length > MAX_KEY_LENGTH
    || typeof value !== "string" || value.length > MAX_VALUE_LENGTH) {
    return withOwnerCookie(NextResponse.json({ error: "Invalid storage key or value; values must be strings under 2 MB." }, { status: 400 }), request, owner);
  }

  try {
    ensurePersistenceSchema();
    getDatabase().prepare(`
      INSERT INTO app_user_data (owner_id, data_key, data_value, updated_at)
      VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(owner_id, data_key) DO UPDATE SET
        data_value = excluded.data_value,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).run(owner, key, value);
    return withOwnerCookie(NextResponse.json({ saved: true }), request, owner);
  } catch (error) {
    return databaseError(error, request, owner);
  }
}

export async function DELETE(request: NextRequest) {
  const owner = ownerFor(request);
  const key = request.nextUrl.searchParams.get("key");
  if (key !== null && (!key || key.length > MAX_KEY_LENGTH)) {
    return withOwnerCookie(NextResponse.json({ error: "Invalid storage key." }, { status: 400 }), request, owner);
  }
  try {
    ensurePersistenceSchema();
    if (key !== null) {
      getDatabase().prepare("DELETE FROM app_user_data WHERE owner_id = ? AND data_key = ?").run(owner, key);
    } else {
      getDatabase().prepare("DELETE FROM app_user_data WHERE owner_id = ?").run(owner);
    }
    return withOwnerCookie(NextResponse.json({ deleted: true }), request, owner);
  } catch (error) {
    return databaseError(error, request, owner);
  }
}
