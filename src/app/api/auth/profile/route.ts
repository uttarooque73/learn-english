import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  hashPassword,
  OWNER_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Account = {
  email: string;
  displayName: string;
  ownerId: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
};

function currentAccount(request: NextRequest): { account: Account; expiresAt: number } | null {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  ensurePersistenceSchema();
  const account = getDatabase().prepare(`
    SELECT email, display_name AS displayName, owner_id AS ownerId,
      password_salt AS passwordSalt, password_hash AS passwordHash, created_at AS createdAt
    FROM learner_accounts WHERE owner_id = ?
  `).get(session.ownerId) as Account | undefined;
  return account ? { account, expiresAt: session.expiresAt } : null;
}

function responseWithSession(data: unknown, account: Account, status = 200): NextResponse {
  const token = createSessionToken({
    ownerId: account.ownerId,
    email: account.email,
    displayName: account.displayName,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  });
  const response = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
  response.cookies.set(SESSION_COOKIE, token, cookieOptions);
  response.cookies.set(OWNER_COOKIE, account.ownerId, cookieOptions);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const current = currentAccount(request);
    if (!current) return NextResponse.json({ error: "Please sign in to manage your account." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const { account } = current;
    return NextResponse.json({
      user: { email: account.email, displayName: account.displayName, createdAt: account.createdAt },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Account details are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Please submit a valid form." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Please submit a valid form." }, { status: 400 });
  }

  try {
    const current = currentAccount(request);
    if (!current) return NextResponse.json({ error: "Please sign in to manage your account." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const payload = body as Record<string, unknown>;
    const { account } = current;

    if (payload.action === "profile") {
      const displayName = typeof payload.displayName === "string" ? payload.displayName.trim().replace(/\s+/g, " ") : "";
      if (displayName.length < 2 || displayName.length > 60) {
        return NextResponse.json({ error: "Name must be between 2 and 60 characters." }, { status: 400 });
      }
      getDatabase().prepare(`
        UPDATE learner_accounts SET display_name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE owner_id = ?
      `).run(displayName, account.ownerId);
      return responseWithSession({
        ok: true,
        message: "Your profile has been updated.",
        user: { email: account.email, displayName },
      }, { ...account, displayName });
    }

    if (payload.action === "password") {
      const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
      const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
      if (newPassword.length < 10 || newPassword.length > 128) {
        return NextResponse.json({ error: "Your new password must be between 10 and 128 characters." }, { status: 400 });
      }
      if (newPassword === currentPassword) {
        return NextResponse.json({ error: "Choose a new password that differs from your current password." }, { status: 400 });
      }
      if (!verifyPassword(currentPassword, account.passwordSalt, account.passwordHash)) {
        return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
      }
      const credentials = hashPassword(newPassword);
      getDatabase().prepare(`
        UPDATE learner_accounts SET password_salt = ?, password_hash = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE owner_id = ?
      `).run(credentials.salt, credentials.hash, account.ownerId);
      return responseWithSession({ ok: true, message: "Your password has been changed." }, account);
    }

    return NextResponse.json({ error: "Choose a valid account update." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("AUTH_SECRET")
      ? "Authentication is not configured. Set AUTH_SECRET before managing your account."
      : "We could not update your account. Please try again.";
    return NextResponse.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
