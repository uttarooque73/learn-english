import { randomUUID } from "node:crypto";
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

    const account = accountByEmail(email);
    if (!account || !verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
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
