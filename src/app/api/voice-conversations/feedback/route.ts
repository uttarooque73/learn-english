import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MessageInput = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
type FeedbackItem = {
  messageId: string;
  originalSentence: string;
  correctedSentence: string;
  naturalSentence: string | null;
  isCorrect: boolean;
  errorCategories: string[];
  severity: "none" | "minor" | "major";
  explanation: string;
};

const TOPICS = new Set(["Random Topic", "Technology", "Software Development", "Work and Meetings", "Travel", "Food and Cooking", "Daily Life", "Business", "Science", "Current Affairs", "Custom Topic"]);
const LEVELS = new Set(["Beginner", "Intermediate", "Advanced"]);
const MAX_MESSAGES = 400;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_BATCH = 8;

function ownerFor(request: NextRequest): string {
  return request.cookies.get("speakup_owner")?.value ?? randomUUID();
}

function response(data: unknown, request: NextRequest, ownerId: string, status = 200): NextResponse {
  const result = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.cookies.has("speakup_owner")) {
    result.cookies.set("speakup_owner", ownerId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return result;
}

function isMessage(value: unknown): value is MessageInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && item.id.length <= 100
    && (item.role === "user" || item.role === "assistant")
    && typeof item.content === "string" && item.content.trim().length > 0 && item.content.length <= MAX_MESSAGE_LENGTH
    && typeof item.createdAt === "string";
}

function isFeedbackItem(value: unknown): value is FeedbackItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.messageId === "string" && typeof item.originalSentence === "string"
    && typeof item.correctedSentence === "string" && (typeof item.naturalSentence === "string" || item.naturalSentence === null)
    && typeof item.isCorrect === "boolean" && Array.isArray(item.errorCategories)
    && item.errorCategories.every((category) => typeof category === "string")
    && ["none", "minor", "major"].includes(String(item.severity)) && typeof item.explanation === "string";
}

async function analyzeBatch(messages: MessageInput[], level: string): Promise<FeedbackItem[]> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen3:4b";
  const prompt = [
    "You are a careful English language teacher. Analyze EVERY supplied learner utterance independently and preserve the original message IDs.",
    "Do not analyze assistant messages. Keep original recognized text exactly; do not silently fix transcription uncertainty.",
    "If a sentence is correct and natural, isCorrect=true, correctedSentence must equal originalSentence, naturalSentence=null, errorCategories=[], severity=none.",
    "Distinguish actual grammar/vocabulary errors from optional naturalness improvements. Do not invent errors. Preserve intended meaning.",
    "For uncertain, incomplete, or possibly misrecognized speech, keep the original unchanged, explain uncertainty, use severity minor, and do not guess.",
    "Return JSON object: { items: [{ messageId, originalSentence, correctedSentence, naturalSentence, isCorrect, errorCategories, severity, explanation }] }.",
    "Use errorCategories from grammar, vocabulary, word-choice, word-order, sentence-structure, natural-expression, transcription-uncertainty.",
    "Severity must be none, minor, or major. Explanation should be learner-friendly and concise.",
    "Learner level: " + level,
    "Learner messages in chronological order: " + JSON.stringify(messages.map((message) => ({ messageId: message.id, text: message.content }))),
  ].join("\n\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const upstream = await fetch(baseUrl + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
    });
    if (!upstream.ok) throw new Error("The feedback provider is unavailable.");
    const payload = await upstream.json() as { response?: unknown };
    if (typeof payload.response !== "string") throw new Error("The feedback provider returned invalid output.");
    const parsed = JSON.parse(payload.response) as { items?: unknown };
    if (!Array.isArray(parsed.items) || !parsed.items.every(isFeedbackItem)) throw new Error("The feedback response did not match the required schema.");
    const expected = new Set(messages.map((message) => message.id));
    const valid = parsed.items.filter((item) => expected.has(item.messageId));
    if (valid.length !== messages.length || new Set(valid.map((item) => item.messageId)).size !== messages.length) {
      throw new Error("The feedback response did not cover every learner utterance.");
    }
    return valid;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  let body: unknown;
  try { body = await request.json(); } catch { return response({ error: "Request body must be valid JSON." }, request, ownerId, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "A JSON object is required." }, request, ownerId, 400);
  const input = body as Record<string, unknown>;
  if (typeof input.sessionId !== "string" || input.sessionId.length > 100
    || typeof input.topic !== "string" || !TOPICS.has(input.topic)
    || typeof input.proficiency !== "string" || !LEVELS.has(input.proficiency)
    || typeof input.durationSeconds !== "number" || !Number.isFinite(input.durationSeconds) || input.durationSeconds < 0
    || !Array.isArray(input.messages) || input.messages.length > MAX_MESSAGES || !input.messages.every(isMessage)) {
    return response({ error: "Invalid session details or transcript." }, request, ownerId, 400);
  }

  const messages = input.messages as MessageInput[];
  const learnerMessages = messages.filter((message) => message.role === "user");
  if (learnerMessages.length === 0) return response({ error: "The session has no learner utterances to analyze." }, request, ownerId, 400);

  try {
    ensurePersistenceSchema();
    const db = getDatabase();
    const existingSession = db.prepare("SELECT owner_id FROM voice_conversation_sessions WHERE id=?").get(input.sessionId) as { owner_id: string } | undefined;
    if (existingSession && existingSession.owner_id !== ownerId) return response({ error: "Conversation not found." }, request, ownerId, 404);
    const startedAt = messages.length ? messages[0].createdAt : new Date().toISOString();
    const endedAt = new Date().toISOString();
    const upsertSession = db.prepare(`INSERT INTO voice_conversation_sessions
      (id, owner_id, topic, proficiency, status, started_at, ended_at, duration_seconds, feedback_status)
      VALUES (?, ?, ?, ?, 'finalizing', ?, ?, ?, 'processing')
      ON CONFLICT(id) DO UPDATE SET status='finalizing', ended_at=excluded.ended_at,
      duration_seconds=excluded.duration_seconds, feedback_status='processing'
      WHERE voice_conversation_sessions.owner_id=excluded.owner_id`);
    const saveMessage = db.prepare(`INSERT INTO voice_conversation_messages
      (id, session_id, owner_id, sequence_number, role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, id) DO UPDATE SET content=excluded.content, created_at=excluded.created_at
      WHERE voice_conversation_messages.owner_id=excluded.owner_id`);
    const saveTranscript = db.transaction(() => {
      upsertSession.run(input.sessionId, ownerId, input.topic, input.proficiency, startedAt, endedAt, Math.floor(input.durationSeconds as number));
      messages.forEach((message, index) => saveMessage.run(message.id, input.sessionId, ownerId, index, message.role, message.content.trim(), message.createdAt));
    });
    saveTranscript();

    const savedMessages = db.prepare("SELECT id, role, content, created_at AS createdAt FROM voice_conversation_messages WHERE owner_id=? AND session_id=? ORDER BY sequence_number")
      .all(ownerId, input.sessionId) as Array<{ id: string; role: string; content: string; createdAt: string }>;
    const persistedLearner = savedMessages.filter((message) => message.role === "user").map((message) => ({ id: message.id, role: "user" as const, content: message.content, createdAt: message.createdAt }));
    const feedback: FeedbackItem[] = [];
    let failure: unknown = null;
    for (let offset = 0; offset < persistedLearner.length; offset += MAX_BATCH) {
      const batch = persistedLearner.slice(offset, offset + MAX_BATCH);
      try {
        const analyzed = await analyzeBatch(batch, input.proficiency as string);
        const saveFeedback = db.prepare(`INSERT INTO voice_conversation_feedback
          (id, session_id, message_id, owner_id, sequence_number, original_sentence, corrected_sentence, natural_sentence, is_correct, error_categories_json, severity, explanation)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id, message_id) DO UPDATE SET original_sentence=excluded.original_sentence,
          corrected_sentence=excluded.corrected_sentence, natural_sentence=excluded.natural_sentence,
          is_correct=excluded.is_correct, error_categories_json=excluded.error_categories_json,
          severity=excluded.severity, explanation=excluded.explanation
          WHERE voice_conversation_feedback.owner_id=excluded.owner_id`);
        const persistBatch = db.transaction(() => analyzed.forEach((item) => {
          const sequence = persistedLearner.findIndex((message) => message.id === item.messageId);
          saveFeedback.run(randomUUID(), input.sessionId, item.messageId, ownerId, sequence, item.originalSentence, item.correctedSentence, item.naturalSentence, item.isCorrect ? 1 : 0, JSON.stringify(item.errorCategories), item.severity, item.explanation);
        }));
        persistBatch();
        feedback.push(...analyzed);
      } catch (error) {
        failure = error;
        break;
      }
    }

    const complete = feedback.length === persistedLearner.length;
    const status = complete ? "complete" : feedback.length ? "partial" : "failed";
    const correctCount = feedback.filter((item) => item.isCorrect).length;
    const categoryCounts = new Map<string, number>();
    feedback.forEach((item) => item.errorCategories.forEach((category) => categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)));
    const overall = {
      totalUtterances: persistedLearner.length,
      analyzedUtterances: feedback.length,
      correctUtterances: correctCount,
      incorrectUtterances: feedback.length - correctCount,
      frequentErrors: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, count]) => ({ category, count })),
      recommendations: [...new Set(feedback.filter((item) => !item.isCorrect).map((item) => item.explanation))].slice(0, 5),
      usefulExpressions: [],
    };
    db.prepare("UPDATE voice_conversation_sessions SET status=?, feedback_status=?, overall_feedback_json=? WHERE id=? AND owner_id=?")
      .run(complete ? "completed" : "failed", status, JSON.stringify(overall), input.sessionId, ownerId);
    const savedFeedback = db.prepare(`SELECT f.message_id AS messageId, f.original_sentence AS originalSentence,
      f.corrected_sentence AS correctedSentence, f.natural_sentence AS naturalSentence, f.is_correct AS isCorrect,
      f.error_categories_json AS categoriesJson, f.severity, f.explanation
      FROM voice_conversation_feedback f WHERE f.owner_id=? AND f.session_id=? ORDER BY f.sequence_number`)
      .all(ownerId, input.sessionId) as Array<Record<string, unknown> & { categoriesJson: string; isCorrect: number }>;
    return response({
      feedback: savedFeedback.map(({ categoriesJson, isCorrect, ...item }) => ({ ...item, isCorrect: Boolean(isCorrect), errorCategories: JSON.parse(categoriesJson) as string[] })),
      overallFeedback: overall,
      feedbackStatus: status,
      ...(failure ? { warning: "Some utterances could not be analyzed; retry feedback generation to complete the report." } : {}),
    }, request, ownerId);
  } catch {
    try {
      const db = getDatabase();
      db.prepare("UPDATE voice_conversation_sessions SET status='failed', feedback_status='failed' WHERE id=? AND owner_id=?")
        .run(input.sessionId, ownerId);
    } catch { /* Preserve the safe API error even if persistence itself is unavailable. */ }
    return response({ error: "Could not persist or analyze this conversation. Check the local AI provider and retry." }, request, ownerId, 503);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerId = ownerFor(request);
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return response({ error: "sessionId is required." }, request, ownerId, 400);
  try {
    ensurePersistenceSchema();
    const db = getDatabase();
    const session = db.prepare("SELECT id, topic, proficiency, status, started_at AS startedAt, ended_at AS endedAt, duration_seconds AS durationSeconds, feedback_status AS feedbackStatus, overall_feedback_json AS overallFeedback FROM voice_conversation_sessions WHERE id=? AND owner_id=?")
      .get(sessionId, ownerId) as Record<string, unknown> | undefined;
    if (!session) return response({ error: "Conversation not found." }, request, ownerId, 404);
    const messages = db.prepare("SELECT id, role, content, created_at AS createdAt FROM voice_conversation_messages WHERE session_id=? AND owner_id=? ORDER BY sequence_number").all(sessionId, ownerId);
    const feedback = db.prepare("SELECT message_id AS messageId, original_sentence AS originalSentence, corrected_sentence AS correctedSentence, natural_sentence AS naturalSentence, is_correct AS isCorrect, error_categories_json AS categoriesJson, severity, explanation FROM voice_conversation_feedback WHERE session_id=? AND owner_id=? ORDER BY sequence_number").all(sessionId, ownerId) as Array<Record<string, unknown> & { categoriesJson: string; isCorrect: number }>;
    return response({ session: { ...session, overallFeedback: typeof session.overallFeedback === "string" ? JSON.parse(session.overallFeedback) : null }, messages, feedback: feedback.map(({ categoriesJson, isCorrect, ...item }) => ({ ...item, isCorrect: Boolean(isCorrect), errorCategories: JSON.parse(categoriesJson) as string[] })) }, request, ownerId);
  } catch { return response({ error: "Conversation history could not be loaded." }, request, ownerId, 500); }
}
