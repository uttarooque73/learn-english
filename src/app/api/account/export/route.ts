import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXCLUDED_TABLES = new Set(["learner_accounts", "schema_migrations", "auth_login_attempts"]);
const PRIVATE_COLUMN = /password|passphrase|secret|token|credential|salt|hash|api[_-]?key/i;
const MAX_ROWS_PER_TABLE = 10_000;

type ExportAccount = { email: string; displayName: string; createdAt: string };

function isSafeIdentifier(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "owner_id" && !PRIVATE_COLUMN.test(key)),
  );
}

/** Export only learning tables belonging to the authenticated account, never authentication secrets. */
export function collectLearningData(database: ReturnType<typeof getDatabase>, ownerId: string) {
  const tables = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;

  const learningData: Record<string, { records: Record<string, unknown>[]; truncated: boolean }> = {};
  for (const { name } of tables) {
    if (!isSafeIdentifier(name) || EXCLUDED_TABLES.has(name) || /auth|session|credential|password|token/i.test(name)) continue;
    const columns = database.prepare(`PRAGMA table_info("${name}")`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "owner_id")) continue;

    const rows = database.prepare(`SELECT * FROM "${name}" WHERE owner_id = ? LIMIT ?`).all(ownerId, MAX_ROWS_PER_TABLE) as Array<Record<string, unknown>>;
    if (rows.length > 0) {
      learningData[name] = {
        records: rows.map(sanitizeRow),
        truncated: rows.length === MAX_ROWS_PER_TABLE,
      };
    }
  }
  return learningData;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { error: "Please sign in before exporting your learning data." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    ensurePersistenceSchema();
    const database = getDatabase();
    const account = database.prepare(`
      SELECT email, display_name AS displayName, created_at AS createdAt
      FROM learner_accounts WHERE owner_id = ?
    `).get(session.ownerId) as ExportAccount | undefined;
    if (!account) {
      return NextResponse.json(
        { error: "Your account could not be verified. Please sign in again." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const exportedAt = new Date().toISOString();
    const payload = {
      format: "speakup-learning-data",
      version: 1,
      exportedAt,
      account,
      note: "Only learning records owned by this account are included. Password hashes, session tokens, and authentication records are excluded.",
      data: collectLearningData(database, session.ownerId),
    };
    const filename = `speakup-learning-data-${exportedAt.slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Your learning data could not be exported right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
