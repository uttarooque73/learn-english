import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { collectLearningData } from "@/lib/account-data-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportAccount = { email: string; displayName: string; createdAt: string };

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
