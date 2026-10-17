import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Level = "Beginner" | "Intermediate" | "Advanced";
type ParagraphFeedback = {
  overallSummary: string;
  corrections: { originalSentence: string; correctedSentence: string; naturalAlternative: string | null; category: string; explanation: string }[];
  vocabularySuggestions: { original: string; suggested: string; reason: string }[];
  practiceSuggestions: string[];
};
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
  let feedback: ParagraphFeedback | null = null;
  try {
    const parsed = JSON.parse(String(row.writing_feedback_json ?? "{}")) as ParagraphFeedback;
    if (parsed && typeof parsed.overallSummary === "string") feedback = parsed;
  } catch { /* Return no feedback for empty or invalid cached output. */ }
  return { id: String(row.id), title: String(row.title), text: String(row.text), level: String(row.proficiency_level) as Level, createdAt: String(row.created_at), feedback };
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
    const paragraphs = (db.prepare("SELECT id,title,text,proficiency_level,created_at,updated_at,writing_feedback_json FROM aius_paragraphs WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100").all(ownerId) as Array<Record<string, unknown>>).map(readParagraph);
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
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,text=excluded.text,proficiency_level=excluded.proficiency_level,updated_at=excluded.updated_at,writing_feedback_json='{}'
        WHERE aius_paragraphs.owner_id=excluded.owner_id`).run(paragraphId, ownerId, title, text, level, now, now);
      const row = db.prepare("SELECT id,title,text,proficiency_level,created_at,updated_at,writing_feedback_json FROM aius_paragraphs WHERE id=? AND owner_id=?").get(paragraphId, ownerId) as Record<string, unknown>;
      return respond({ paragraph: readParagraph(row) }, request, ownerId);
    }
    if (input.kind === "feedback") {
      const paragraphId = typeof input.paragraphId === "string" ? input.paragraphId : "";
      if (!paragraphId || paragraphId.length > 100) return respond({ error: "A valid paragraph ID is required." }, request, ownerId, 400);
      const paragraph = db.prepare("SELECT id,text,proficiency_level FROM aius_paragraphs WHERE id=? AND owner_id=?")
        .get(paragraphId, ownerId) as { id: string; text: string; proficiency_level: Level } | undefined;
      if (!paragraph) return respond({ error: "Paragraph not found." }, request, ownerId, 404);

      const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
      const model = process.env.OLLAMA_MODEL || "llama3.1:8b";
      const prompt = [
        "You are a careful, encouraging English writing coach.",
        "Analyze the learner's saved paragraph and produce actionable feedback without inventing errors.",
        "Preserve intended meaning. Distinguish actual grammar errors from optional stylistic improvements.",
        "If the text is already correct, say so in overallSummary and return empty corrections and vocabularySuggestions when no meaningful improvement is needed.",
        "Return JSON only using this exact shape: { overallSummary: string, corrections: [{ originalSentence: string, correctedSentence: string, naturalAlternative: string|null, category: string, explanation: string }], vocabularySuggestions: [{ original: string, suggested: string, reason: string }], practiceSuggestions: string[] }.",
        "Keep feedback learner-friendly. Limit corrections to 30, vocabulary suggestions to 15, practice suggestions to 8. Do not return Markdown fences.",
        "Learner level: " + paragraph.proficiency_level,
        "Paragraph: " + JSON.stringify(paragraph.text),
      ].join("\n\n");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      let feedback: ParagraphFeedback;
      try {
        const upstream = await fetch(baseUrl + "/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
        });
        if (!upstream.ok) throw new Error("The writing-feedback provider is unavailable.");
        const payload = await upstream.json() as { response?: unknown };
        if (typeof payload.response !== "string") throw new Error("The writing-feedback provider returned invalid output.");
        const parsed = JSON.parse(payload.response) as Record<string, unknown>;
        const corrections = parsed.corrections;
        const vocabularySuggestions = parsed.vocabularySuggestions;
        const practiceSuggestions = parsed.practiceSuggestions;
        const validCorrections = Array.isArray(corrections) && corrections.length <= 30 && corrections.every((item) => {
          if (!item || typeof item !== "object") return false;
          const value = item as Record<string, unknown>;
          return typeof value.originalSentence === "string" && value.originalSentence.length <= 2000
            && typeof value.correctedSentence === "string" && value.correctedSentence.length <= 2000
            && (typeof value.naturalAlternative === "string" || value.naturalAlternative === null)
            && (value.naturalAlternative === null || value.naturalAlternative.length <= 2000)
            && typeof value.category === "string" && value.category.length <= 80
            && typeof value.explanation === "string" && value.explanation.length <= 1500;
        });
        const validVocabulary = Array.isArray(vocabularySuggestions) && vocabularySuggestions.length <= 15 && vocabularySuggestions.every((item) => {
          if (!item || typeof item !== "object") return false;
          const value = item as Record<string, unknown>;
          return typeof value.original === "string" && value.original.length <= 200
            && typeof value.suggested === "string" && value.suggested.length <= 200
            && typeof value.reason === "string" && value.reason.length <= 1000;
        });
        if (typeof parsed.overallSummary !== "string" || !parsed.overallSummary.trim() || parsed.overallSummary.length > 2000
          || !validCorrections || !validVocabulary
          || !Array.isArray(practiceSuggestions) || practiceSuggestions.length > 8
          || !practiceSuggestions.every((item) => typeof item === "string" && item.length <= 600)) {
          throw new Error("The writing-feedback response did not match the required schema.");
        }
        feedback = { overallSummary: parsed.overallSummary, corrections: corrections as ParagraphFeedback["corrections"], vocabularySuggestions: vocabularySuggestions as ParagraphFeedback["vocabularySuggestions"], practiceSuggestions: practiceSuggestions as string[] };
      } finally {
        clearTimeout(timeout);
      }
      db.prepare("UPDATE aius_paragraphs SET writing_feedback_json=?,updated_at=? WHERE id=? AND owner_id=?")
        .run(JSON.stringify(feedback), new Date().toISOString(), paragraphId, ownerId);
      return respond({ feedback, paragraphId }, request, ownerId);
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
    return respond({ error: "kind must be paragraph, feedback, or attempt." }, request, ownerId, 400);
  } catch {
    return respond({ error: "Could not save AI and Us practice data." }, request, ownerId, 503);
  }
}
