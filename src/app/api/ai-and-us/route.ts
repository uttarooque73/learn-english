import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Level = "Beginner" | "Intermediate" | "Advanced";
const MAX_PARAGRAPH_LENGTH = 12000;
const MAX_TITLE_LENGTH = 120;

function ownerFor(request: NextRequest): string {
  return request.cookies.get("speakup_owner")?.value ?? randomUUID();
}
function respond(data: unknown, request: NextRequest, ownerId: string, status = 200): NextResponse {
  const response = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.cookies.has("speakup_owner")) response.cookies.set("speakup_owner", ownerId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000,
  });
  return response;
}
function schema() {
  ensurePersistenceSchema();
}
function getOwnerParagraph(db: ReturnType<typeof getDatabase>, paragraphId: string, ownerId: string) {
  return db.prepare("SELECT id FROM aius_paragraphs WHERE id=? AND owner_id=?").get(paragraphId, ownerId);
}
function readParagraph(row: Record<string, unknown>) {
  return { id: String(row.id), title: String(row.title), text: String(row.text), level: String(row.proficiency_level) as Level, createdAt: String(row.created_at) };
}
function readAttempt(row: Record<string, unknown>) {
  let missingWords: string[] = [], extraWords: string[] = [];
  try { missingWords = JSON.parse(String(row.missing_words_json)) as string[]; } catch { /* return empty details for legacy/corrupt rows */ }
  try { extraWords = JSON.parse(String(row.extra_words_json)) as string[]; } catch { /* return empty details for legacy/corrupt rows */ }
  return { id: String(row.id), paragraphId: String(row.paragraph_id ?? ""), target: String(row.target), transcript: String(row.transcript), score: typeof row.score === "number" ? row.score : null, createdAt: String(row.created_at), missingWords, extraWords };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  try {
    schema();
    const db = getDatabase();
    const paragraphs = (db.prepare("SELECT id,title,text,proficiency_level,created_at,updated_at FROM aius_paragraphs WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100").all(ownerId) as Array<Record<string, unknown>>).map(readParagraph);
    const attempts = (db.prepare("SELECT id,paragraph_id,target,transcript,score,missing_words_json,extra_words_json,created_at FROM aius_reading_attempts WHERE owner_id=? ORDER BY created_at DESC LIMIT 100").all(ownerId) as Array<Record<string, unknown>>).map(readAttempt);
    return respond({ paragraphs, attempts }, request, ownerId);
  } catch {
    return respond({ error: "Could not load AI and Us practice history." }, request, ownerId, 503);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  let body: unknown;
  try { body = await request.json(); } catch { return respond({ error: "Request body must be valid JSON." }, request, ownerId, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "A JSON object is required." }, request, ownerId, 400);
  const input = body as Record<string, unknown>;
  try {
    schema();
    const db = getDatabase();
    if (input.kind === "paragraph") {
      const title = typeof input.title === "string" ? input.title.trim() : "";
      const text = typeof input.text === "string" ? input.text.trim() : "";
      const level = input.level;
      if (!title || title.length > MAX_TITLE_LENGTH || !text || text.length > MAX_PARAGRAPH_LENGTH || !["Beginner", "Intermediate", "Advanced"].includes(String(level))) {
        return respond({ error: "Provide a title, a paragraph up to 12,000 characters, and a valid English level." }, request, ownerId, 400);
      }
      const now = new Date().toISOString();
      const paragraphId = typeof input.id === "string" ? input.id : randomUUID();
      if (input.id && !getOwnerParagraph(db, paragraphId, ownerId)) return respond({ error: "Paragraph not found." }, request, ownerId, 404);
      db.prepare(`INSERT INTO aius_paragraphs(id,owner_id,title,text,proficiency_level,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,text=excluded.text,proficiency_level=excluded.proficiency_level,updated_at=excluded.updated_at
        WHERE aius_paragraphs.owner_id=excluded.owner_id`).run(paragraphId, ownerId, title, text, level, now, now);
      const row = db.prepare("SELECT id,title,text,proficiency_level,created_at,updated_at FROM aius_paragraphs WHERE id=? AND owner_id=?").get(paragraphId, ownerId) as Record<string, unknown>;
      return respond({ paragraph: readParagraph(row) }, request, ownerId);
    }
    if (input.kind === "attempt") {
      const target = typeof input.target === "string" ? input.target.trim() : "";
      const transcript = typeof input.transcript === "string" ? input.transcript.trim() : "";
      const score = input.score;
      const missingWords = Array.isArray(input.missingWords) && input.missingWords.every((item) => typeof item === "string" && item.length <= 80) ? input.missingWords as string[] : [];
      const extraWords = Array.isArray(input.extraWords) && input.extraWords.every((item) => typeof item === "string" && item.length <= 80) ? input.extraWords as string[] : [];
      const paragraphId = typeof input.paragraphId === "string" ? input.paragraphId : null;
      if (!target || target.length > 2000 || !transcript || transcript.length > 4000
        || typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100
        || (paragraphId && !getOwnerParagraph(db, paragraphId, ownerId))) {
        return respond({ error: "Invalid reading attempt or paragraph reference." }, request, ownerId, 400);
      }
      const attemptId = randomUUID(), createdAt = new Date().toISOString();
      db.prepare("INSERT INTO aius_reading_attempts(id,owner_id,paragraph_id,target,transcript,score,missing_words_json,extra_words_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(attemptId, ownerId, paragraphId, target, transcript, score, JSON.stringify(missingWords), JSON.stringify(extraWords), createdAt);
      return respond({ attempt: { id: attemptId, paragraphId: paragraphId ?? "", target, transcript, score, createdAt, missingWords, extraWords } }, request, ownerId);
    }
    return respond({ error: "kind must be paragraph or attempt." }, request, ownerId, 400);
  } catch {
    return respond({ error: "Could not save AI and Us practice data." }, request, ownerId, 503);
  }
}
