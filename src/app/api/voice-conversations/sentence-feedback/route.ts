import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Input = { sessionId: string; topic: string; proficiency: string; startedAt: string; sequenceNumber: number; message: { id: string; role: "user"; content: string; createdAt: string } };
function ownerFor(request: NextRequest): string { return request.cookies.get("speakup_owner")?.value ?? randomUUID(); }
function respond(data: unknown, request: NextRequest, ownerId: string, status = 200): NextResponse {
  const result = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.cookies.has("speakup_owner")) result.cookies.set("speakup_owner", ownerId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return result;
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  let body: unknown;
  try { body = await request.json(); } catch { return respond({ error: "Request body must be valid JSON." }, request, ownerId, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "A JSON object is required." }, request, ownerId, 400);
  const input = body as Partial<Input>;
  if (typeof input.sessionId !== "string" || input.sessionId.length > 100
    || typeof input.topic !== "string" || input.topic.length > 120
    || typeof input.proficiency !== "string" || !["Beginner", "Intermediate", "Advanced"].includes(input.proficiency)
    || typeof input.startedAt !== "string" || typeof input.sequenceNumber !== "number" || !Number.isInteger(input.sequenceNumber) || input.sequenceNumber < 0
    || !input.message || typeof input.message.id !== "string" || input.message.id.length > 100
    || input.message.role !== "user" || typeof input.message.content !== "string" || !input.message.content.trim() || input.message.content.length > 4000
    || typeof input.message.createdAt !== "string") return respond({ error: "Invalid sentence or session details." }, request, ownerId, 400);
  const message = input.message;
  try {
    ensurePersistenceSchema();
    const db = getDatabase();
    const existing = db.prepare("SELECT owner_id FROM voice_conversation_sessions WHERE id=?").get(input.sessionId) as { owner_id: string } | undefined;
    if (existing && existing.owner_id !== ownerId) return respond({ error: "Conversation not found." }, request, ownerId, 404);
    db.transaction(() => {
      db.prepare(`INSERT INTO voice_conversation_sessions (id, owner_id, topic, proficiency, status, started_at, feedback_status)
        VALUES (?, ?, ?, ?, 'active', ?, 'pending')
        ON CONFLICT(id) DO UPDATE SET topic=excluded.topic, proficiency=excluded.proficiency
        WHERE voice_conversation_sessions.owner_id=excluded.owner_id`)
        .run(input.sessionId, ownerId, input.topic, input.proficiency, input.startedAt);
      db.prepare(`INSERT INTO voice_conversation_messages (id, session_id, owner_id, sequence_number, role, content, created_at)
        VALUES (?, ?, ?, ?, 'user', ?, ?)
        ON CONFLICT(session_id, id) DO UPDATE SET content=excluded.content
        WHERE voice_conversation_messages.owner_id=excluded.owner_id`)
        .run(message.id, input.sessionId, ownerId, input.sequenceNumber, message.content.trim(), message.createdAt);
    })();
    const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
    const model = process.env.OLLAMA_MODEL || "qwen3:4b";
    const prompt = [
      "You are a careful, encouraging English teacher. Give concise feedback on exactly one learner sentence.",
      "Keep the original text unchanged. If correct and natural, correctedSentence must equal originalSentence and isCorrect=true.",
      "If incorrect, provide a grammatically correct sentence with the same intended meaning. Provide a naturalSentence only when a genuinely more natural alternative exists.",
      "Explain the key grammar or vocabulary point in plain language. Do not invent errors or guess if the transcript is uncertain.",
      "Return JSON only: { originalSentence, correctedSentence, naturalSentence, isCorrect, errorCategories, severity, explanation }.",
      "errorCategories is an array using grammar, vocabulary, word-choice, word-order, sentence-structure, natural-expression, transcription-uncertainty. severity is none, minor, or major.",
      "Learner level: " + input.proficiency,
      "Learner sentence: " + JSON.stringify(message.content),
    ].join("\n\n");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let parsed: Record<string, unknown>;
    try {
      const upstream = await fetch(baseUrl + "/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
      });
      if (!upstream.ok) throw new Error("Feedback provider unavailable");
      const payload = await upstream.json() as { response?: unknown };
      if (typeof payload.response !== "string") throw new Error("Invalid feedback response");
      parsed = JSON.parse(payload.response) as Record<string, unknown>;
    } finally { clearTimeout(timeout); }
    const valid = typeof parsed.originalSentence === "string" && typeof parsed.correctedSentence === "string"
      && (typeof parsed.naturalSentence === "string" || parsed.naturalSentence === null)
      && typeof parsed.isCorrect === "boolean" && Array.isArray(parsed.errorCategories)
      && parsed.errorCategories.every((value) => typeof value === "string")
      && ["none", "minor", "major"].includes(String(parsed.severity)) && typeof parsed.explanation === "string";
    if (!valid) return respond({ error: "The feedback provider returned an invalid sentence analysis." }, request, ownerId, 502);
    const item = {
      messageId: message.id,
      originalSentence: message.content.trim(),
      correctedSentence: parsed.correctedSentence as string,
      naturalSentence: parsed.naturalSentence as string | null,
      isCorrect: parsed.isCorrect as boolean,
      errorCategories: parsed.errorCategories as string[],
      severity: parsed.severity as "none" | "minor" | "major",
      explanation: parsed.explanation as string,
    };
    db.prepare(`INSERT INTO voice_conversation_feedback
      (id, session_id, message_id, owner_id, sequence_number, original_sentence, corrected_sentence, natural_sentence, is_correct, error_categories_json, severity, explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, message_id) DO UPDATE SET original_sentence=excluded.original_sentence,
      corrected_sentence=excluded.corrected_sentence, natural_sentence=excluded.natural_sentence, is_correct=excluded.is_correct,
      error_categories_json=excluded.error_categories_json, severity=excluded.severity, explanation=excluded.explanation
      WHERE voice_conversation_feedback.owner_id=excluded.owner_id`)
      .run(randomUUID(), input.sessionId, message.id, ownerId, input.sequenceNumber, item.originalSentence, item.correctedSentence,
        item.naturalSentence, item.isCorrect ? 1 : 0, JSON.stringify(item.errorCategories), item.severity, item.explanation);
    return respond({ feedback: { ...item, isCorrect: Boolean(item.isCorrect) } }, request, ownerId);
  } catch {
    return respond({ error: "Sentence feedback is temporarily unavailable. Your conversation can continue and the transcript remains saved." }, request, ownerId, 503);
  }
}
