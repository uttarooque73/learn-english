import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, OWNER_COOKIE, verifyPassword, verifySessionToken } from "@/lib/auth";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountRow = { ownerId: string; passwordSalt: string; passwordHash: string };

function clearAuthCookies(response: NextResponse): NextResponse {
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

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Please sign in before deleting your account." }, {
      status: 401, headers: { "Cache-Control": "no-store" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Please confirm the deletion request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Please confirm the deletion request." }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const password = typeof payload.password === "string" ? payload.password : "";
  if (payload.confirmation !== "DELETE") {
    return NextResponse.json({ error: 'Type "DELETE" to confirm permanent account deletion.' }, { status: 400 });
  }
  if (!password || password.length > 128) {
    return NextResponse.json({ error: "Enter your current password to continue." }, { status: 400 });
  }

  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    const account = database.prepare(`
      SELECT owner_id AS ownerId, password_salt AS passwordSalt, password_hash AS passwordHash
      FROM learner_accounts WHERE owner_id = ?
    `).get(session.ownerId) as AccountRow | undefined;
    if (!account || !verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      return NextResponse.json({ error: "Your current password is incorrect." }, {
        status: 401, headers: { "Cache-Control": "no-store" },
      });
    }

    database.transaction(() => {
      const tables = database.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name DESC
      `).all() as Array<{ name: string }>;

      for (const { name } of tables) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ||
            ["learner_accounts", "schema_migrations"].includes(name) ||
            /auth_login_attempts/i.test(name)) continue;
        const columns = database.prepare(`PRAGMA table_info("${name}")`).all() as Array<{ name: string }>;
        if (columns.some((column) => column.name === "owner_id")) {
          database.prepare(`DELETE FROM "${name}" WHERE owner_id = ?`).run(account.ownerId);
        }
      }
      database.prepare("DELETE FROM learner_accounts WHERE owner_id = ?").run(account.ownerId);
    })();

    return clearAuthCookies(NextResponse.json({
      ok: true,
      message: "Your account and saved learning data have been deleted.",
    }, { headers: { "Cache-Control": "no-store" } }));
  } catch {
    return NextResponse.json({ error: "We could not delete your account. No changes were saved; please try again." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
