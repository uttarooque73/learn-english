import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import {
  assertAuthConfiguration,
  createSessionToken,
  hashPassword,
  OWNER_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  email: string;
  displayName: string;
  passwordSalt: string;
  passwordHash: string;
  ownerId: string;
};

const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 5;

function emailKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function isLoginLocked(email: string, now = Math.floor(Date.now() / 1000)): boolean {
  const row = getDatabase().prepare(
    "SELECT locked_until AS lockedUntil, window_started_at AS windowStartedAt FROM auth_login_attempts WHERE email_hash = ?",
  ).get(emailKey(email)) as { lockedUntil: number; windowStartedAt: number } | undefined;
  if (!row) return false;
  if (row.windowStartedAt + LOGIN_WINDOW_SECONDS <= now && row.lockedUntil <= now) {
    getDatabase().prepare("DELETE FROM auth_login_attempts WHERE email_hash = ?").run(emailKey(email));
    return false;
  }
  return row.lockedUntil > now;
}

function recordFailedLogin(email: string, now = Math.floor(Date.now() / 1000)): boolean {
  const key = emailKey(email);
  const database = getDatabase();
  const record = database.transaction(() => {
    const row = database.prepare(
      "SELECT failed_attempts AS failedAttempts, window_started_at AS windowStartedAt FROM auth_login_attempts WHERE email_hash = ?",
    ).get(key) as { failedAttempts: number; windowStartedAt: number } | undefined;
    const withinWindow = Boolean(row && row.windowStartedAt + LOGIN_WINDOW_SECONDS > now);
    const attempts = withinWindow ? row!.failedAttempts + 1 : 1;
    const windowStartedAt = withinWindow ? row!.windowStartedAt : now;
    const lockedUntil = attempts >= LOGIN_MAX_FAILURES ? now + LOGIN_WINDOW_SECONDS : 0;
    database.prepare(`
      INSERT INTO auth_login_attempts (email_hash, window_started_at, failed_attempts, locked_until, updated_at)
      VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(email_hash) DO UPDATE SET
        window_started_at = excluded.window_started_at,
        failed_attempts = excluded.failed_attempts,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at
    `).run(key, windowStartedAt, attempts, lockedUntil);
    return attempts >= LOGIN_MAX_FAILURES;
  });
  return record();
}

function accountByEmail(email: string): AccountRow | undefined {
  return getDatabase().prepare(`
    SELECT id, email, display_name AS displayName, password_salt AS passwordSalt,
      password_hash AS passwordHash, owner_id AS ownerId
    FROM learner_accounts WHERE email = ? COLLATE NOCASE
  `).get(email) as AccountRow | undefined;
}

function applySession(response: NextResponse, account: Pick<AccountRow, "email" | "displayName" | "ownerId">): NextResponse {
  const token = createSessionToken({
    ownerId: account.ownerId,
    email: account.email,
    displayName: account.displayName,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  });
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
  response.cookies.set(SESSION_COOKIE, token, options);
  response.cookies.set(OWNER_COOKIE, account.ownerId, options);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({
      authenticated: true,
      user: { email: session.email, displayName: session.displayName },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Authentication is not configured correctly." }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Please submit a valid form." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Please submit a valid form." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const action = payload.action;
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (action !== "login" && action !== "register") {
    return NextResponse.json({ error: "Choose login or register." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 10 || password.length > 128) {
    return NextResponse.json({ error: "Password must be between 10 and 128 characters." }, { status: 400 });
  }

  try {
    assertAuthConfiguration();
    ensurePersistenceSchema();
    const database = getDatabase();
    if (action === "register") {
      const displayName = typeof payload.displayName === "string" ? payload.displayName.trim().replace(/\s+/g, " ") : "";
      if (displayName.length < 2 || displayName.length > 60) {
        return NextResponse.json({ error: "Name must be between 2 and 60 characters." }, { status: 400 });
      }
      if (accountByEmail(email)) {
        return NextResponse.json({ error: "An account with this email already exists. Try signing in." }, { status: 409 });
      }
      const credentials = hashPassword(password);
      const ownerCookie = request.cookies.get(OWNER_COOKIE)?.value;
      const ownerId = ownerCookie && /^[0-9a-f-]{36}$/i.test(ownerCookie) ? ownerCookie : randomUUID();
      const account: AccountRow = {
        id: randomUUID(),
        email,
        displayName,
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        ownerId,
      };
      database.prepare(`
        INSERT INTO learner_accounts (id, email, display_name, password_salt, password_hash, owner_id)
        VALUES (@id, @email, @displayName, @passwordSalt, @passwordHash, @ownerId)
      `).run(account);
      return applySession(NextResponse.json({
        ok: true,
        user: { email: account.email, displayName: account.displayName },
      }, { headers: { "Cache-Control": "no-store" } }), account);
    }

    if (isLoginLocked(email)) {
      return NextResponse.json(
        { error: "Too many unsuccessful sign-in attempts. Please wait 15 minutes before trying again." },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(LOGIN_WINDOW_SECONDS) } },
      );
    }
    const account = accountByEmail(email);
    if (!account || !verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      const locked = recordFailedLogin(email);
      return NextResponse.json({
        error: locked
          ? "Too many unsuccessful sign-in attempts. Please wait 15 minutes before trying again."
          : "Email or password is incorrect.",
      }, {
        status: locked ? 429 : 401,
        headers: { "Cache-Control": "no-store", ...(locked ? { "Retry-After": String(LOGIN_WINDOW_SECONDS) } : {}) },
      });
    }
    getDatabase().prepare("DELETE FROM auth_login_attempts WHERE email_hash = ?").run(emailKey(email));
    return applySession(NextResponse.json({
      ok: true,
      user: { email: account.email, displayName: account.displayName },
    }, { headers: { "Cache-Control": "no-store" } }), account);
  } catch (error) {
    const message = error instanceof Error && error.message.includes("AUTH_SECRET")
      ? "Authentication is not configured. Set AUTH_SECRET to a random secret of at least 32 characters."
      : "We could not complete authentication. Please try again.";
    return NextResponse.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  for (const name of [SESSION_COOKIE, OWNER_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
