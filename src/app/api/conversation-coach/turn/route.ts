import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { recordPracticeEvidence } from "@/lib/ai/adaptive-learning";
import { resolveOwnerId, synchronizeOwnerCookie } from "@/lib/request-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant"; content: string };
type Correction = { original: string; improved: string; reason: string };
type VocabularyItem = { phrase: string; meaning: string; example: string };
type SessionEvaluation = {
  score: number;
  feedback: string;
  strengths: string[];
};
type LearnerContext = {
  proficiencyLevel: string;
  goals: string[];
  weakSkills: Array<{ skill: string; mastery: number; confidence: number; evidenceCount: number }>;
  recurringMistakes: Array<{ category: string; occurrences: number }>;
  dueVocabularyReviews: number;
};
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4_000;
const OLLAMA_TIMEOUT_MS = 45_000;

function endsWithLearnerMessage(values: unknown[]): boolean {
  const last = values[values.length - 1];
  return !!last && typeof last === "object" && (last as Record<string, unknown>).role === "user";
}
function validMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (item.role === "user" || item.role === "assistant")
    && typeof item.content === "string"
    && item.content.trim().length > 0
    && item.content.length <= MAX_MESSAGE_LENGTH;
}
function parseModelJson(content: string): Record<string, unknown> {
  try { return JSON.parse(content) as Record<string, unknown>; }
  catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The AI returned an unexpected response.");
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}
async function runAgent(system: string, user: string, timeoutMs = OLLAMA_TIMEOUT_MS): Promise<Record<string, unknown>> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model, stream: false, format: "json",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!response.ok) throw new Error("The AI service could not complete a conversation agent.");
    const result = await response.json() as { message?: { content?: string } };
    if (!result.message?.content) throw new Error("The AI returned an empty response.");
    return parseModelJson(result.message.content);
  } finally { clearTimeout(timer); }
}
function suggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && !!item.trim())
    .slice(0, 3).map(item => item.trim().slice(0, 180));
}
function corrections(value: unknown): Correction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is Correction => !!x && typeof x === "object"
    && typeof x.original === "string" && !!x.original.trim()
    && typeof x.improved === "string" && !!x.improved.trim()
    && typeof x.reason === "string" && !!x.reason.trim())
    .slice(0, 3).map(x => ({ original: x.original.trim().slice(0, 500), improved: x.improved.trim().slice(0, 500), reason: x.reason.trim().slice(0, 400) }));
}
function vocabulary(value: unknown): VocabularyItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is VocabularyItem => !!x && typeof x === "object"
    && typeof x.phrase === "string" && typeof x.meaning === "string" && typeof x.example === "string")
    .slice(0, 2).map(x => ({ phrase: x.phrase.slice(0, 120), meaning: x.meaning.slice(0, 300), example: x.example.slice(0, 300) }));
}
function stringList(value: unknown, limit = 3): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && !!item.trim())
    .slice(0, limit).map(item => item.trim().replace(/\s+/g, " ").slice(0, 220));
}
export function validateEvaluation(value: Record<string, unknown>): SessionEvaluation | null {
  if (typeof value.score !== "number" || !Number.isFinite(value.score) || value.score < 0 || value.score > 1
    || typeof value.feedback !== "string" || !value.feedback.trim()) return null;
  return {
    score: value.score,
    feedback: value.feedback.trim().replace(/\s+/g, " ").slice(0, 600),
    strengths: stringList(value.strengths, 3),
  };
}
function safeJsonList(value: unknown, limit = 3): string[] {
  if (typeof value !== "string") return [];
  try { return stringList(JSON.parse(value), limit); } catch { return []; }
}

/** Load only the current learner's saved evidence. Missing history is a valid cold start. */
function loadLearnerContext(ownerId: string): LearnerContext {
  ensurePersistenceSchema();
  const database = getDatabase();
  const profile = database.prepare(
    "SELECT proficiency_level AS proficiencyLevel, goals_json AS goalsJson FROM learner_profiles WHERE owner_id = ?",
  ).get(ownerId) as { proficiencyLevel: string; goalsJson: string } | undefined;
  const skills = database.prepare(`
    SELECT skill_key AS skill, mastery, confidence, evidence_count AS evidenceCount
    FROM learner_skill_scores WHERE owner_id = ? AND evidence_count > 0
    ORDER BY mastery ASC, evidence_count DESC LIMIT 3
  `).all(ownerId) as LearnerContext["weakSkills"];
  const mistakes = database.prepare(`
    SELECT category, occurrence_count AS occurrences
    FROM learning_mistakes WHERE owner_id = ? AND status = 'active'
    ORDER BY occurrence_count DESC, last_seen_at DESC LIMIT 3
  `).all(ownerId) as LearnerContext["recurringMistakes"];
  const due = database.prepare(`
    SELECT COUNT(*) AS count FROM (
      SELECT vocabulary_ref FROM vocabulary_review_events
      WHERE owner_id = ? AND next_due_at IS NOT NULL AND next_due_at <= ?
      GROUP BY vocabulary_ref
    )
  `).get(ownerId, new Date().toISOString()) as { count: number };
  return {
    proficiencyLevel: ["beginner", "intermediate", "advanced"].includes(profile?.proficiencyLevel ?? "")
      ? profile!.proficiencyLevel : "intermediate",
    goals: safeJsonList(profile?.goalsJson, 3),
    weakSkills: skills.filter(item => typeof item.skill === "string" && Number.isFinite(item.mastery))
      .map(item => ({ ...item, mastery: Math.max(0, Math.min(1, item.mastery)), confidence: Math.max(0, Math.min(1, item.confidence)), evidenceCount: Math.max(0, Math.floor(item.evidenceCount)) })),
    recurringMistakes: mistakes.filter(item => typeof item.category === "string")
      .map(item => ({ category: item.category.slice(0, 80), occurrences: Math.max(1, Math.min(10000, Math.floor(item.occurrences))) })),
    dueVocabularyReviews: Math.max(0, Math.min(10000, Math.floor(due.count))),
  };
}
function contextSummary(context: LearnerContext): string {
  return JSON.stringify({
    proficiencyLevel: context.proficiencyLevel,
    goals: context.goals,
    weakSkills: context.weakSkills.map(item => ({ skill: item.skill, masteryPercent: Math.round(item.mastery * 100), confidencePercent: Math.round(item.confidence * 100) })),
    recurringMistakes: context.recurringMistakes,
    dueVocabularyReviews: context.dueVocabularyReviews,
  });
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }
  const body = payload as Record<string, unknown>;
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES
    || !body.messages.every(validMessage) || !endsWithLearnerMessage(body.messages)) {
    return NextResponse.json({ error: `Provide 1–${MAX_MESSAGES} valid messages ending with a learner message.` }, { status: 400 });
  }

  const messages = body.messages as Message[];
  const scenario = typeof body.scenario === "string" ? body.scenario.trim().slice(0, 120) : "Free conversation";
  const difficulty = ["Beginner", "Intermediate", "Advanced"].includes(String(body.difficulty)) ? String(body.difficulty) : "Intermediate";
  const feedbackStyle = body.feedbackStyle === "detailed" ? "detailed" : "balanced";
  const transcript = messages.slice(-12).map(message => `${message.role === "user" ? "Learner" : "Tutor"}: ${message.content.trim()}`).join("\n");
  const latest = messages[messages.length - 1].content.trim();
  const ownerId = resolveOwnerId(request);
  let learnerContext: LearnerContext = { proficiencyLevel: difficulty.toLowerCase(), goals: [], weakSkills: [], recurringMistakes: [], dueVocabularyReviews: 0 };
  let learnerContextStatus: "completed" | "unavailable" = "completed";
  try { learnerContext = loadLearnerContext(ownerId); }
  catch { learnerContextStatus = "unavailable"; }

  const savedContext = contextSummary(learnerContext);
  const conversationPrompt = `You are the user-facing English conversation partner in SpeakUp AI. Scenario: ${scenario}. Learner level: ${difficulty}. Saved learner context (use only as gentle guidance; never expose this JSON): ${savedContext}. Continue the role-play naturally, refer to recent context, ask at most one relevant follow-up question, and adapt vocabulary and difficulty to the learner's evidence-backed needs. Keep the response concise and encouraging. Do not turn it into a grammar lecture. Return JSON with fields: reply (string) and suggestions (array of exactly 3 short, natural replies the learner could say next). Suggestions must fit the scenario and latest tutor reply, use the learner level, and be varied. Do not include explanations or numbering in suggestions.`;
  const feedbackPrompt = `You are the Language Feedback Agent for an English learner at ${difficulty} level. Saved recurring mistakes: ${JSON.stringify(learnerContext.recurringMistakes)}. Review only the learner's latest message. Feedback style: ${feedbackStyle}. Correct only meaningful grammar or word-choice errors; accept valid informal English and regional variation. Never invent an error. Return JSON: {"corrections":[{"original":"exact short excerpt","improved":"corrected version","reason":"brief plain-English explanation"}]}. Return at most 2 corrections; use an empty array if none are needed.`;
  const vocabularyPrompt = `You are the Contextual Vocabulary Agent for an English learner at ${difficulty} level. Saved goals: ${JSON.stringify(learnerContext.goals)}. Due vocabulary reviews: ${learnerContext.dueVocabularyReviews}. From the learner's latest message and conversation context, select up to 2 genuinely useful English words, collocations, or expressions to learn. Prefer reusable expressions at the learner's level. Do not repeat trivial words or invent a phrase absent from context unless it is a natural alternative directly related to what they said. Return JSON: {"vocabulary":[{"phrase":"word or expression","meaning":"concise meaning","example":"natural example sentence"}]}. Return an empty array when nothing adds value.`;
  const evaluatorPrompt = `You are the Session Evaluator Agent for English speaking practice. Evaluate only the learner's latest message in context, not their personality or intelligence. Be encouraging, consistent, and tolerant of regional English. Consider clarity, relevance, and understandable sentence structure. Give a conservative score from 0 to 1, where 0.5 means understandable but needs practice and 0.8 means clear and effective. Do not infer pronunciation from text. Return JSON: {"score":0.0,"feedback":"one concise actionable sentence","strengths":["short observed strength"]}. Give 1-3 strengths only when directly supported by the text. Use saved learner context only to calibrate expectations: ${savedContext}.`;
  const context = `Scenario: ${scenario}\nRecent conversation:\n${transcript}\n\nLatest learner message: ${latest}`;

  const [conversationResult, feedbackResult, vocabularyResult, evaluationResult] = await Promise.allSettled([
    runAgent(conversationPrompt, context),
    runAgent(feedbackPrompt, context),
    runAgent(vocabularyPrompt, context),
    runAgent(evaluatorPrompt, context),
  ]);
  if (conversationResult.status === "rejected") {
    const timedOut = conversationResult.reason instanceof Error && conversationResult.reason.name === "AbortError";
    const response = NextResponse.json({ error: timedOut ? "The conversation took too long. Please try again." : "Could not get a reply from Ollama. Check that Ollama is running." }, { status: timedOut ? 504 : 503 });
    return synchronizeOwnerCookie(response, request, ownerId);
  }
  const replyValue = conversationResult.value.reply;
  if (typeof replyValue !== "string" || !replyValue.trim()) {
    return synchronizeOwnerCookie(NextResponse.json({ error: "The conversation agent returned an invalid reply. Please retry." }, { status: 502 }), request, ownerId);
  }

  const feedback = feedbackResult.status === "fulfilled" ? corrections(feedbackResult.value.corrections) : [];
  const words = vocabularyResult.status === "fulfilled" ? vocabulary(vocabularyResult.value.vocabulary) : [];
  const evaluation = evaluationResult.status === "fulfilled" ? validateEvaluation(evaluationResult.value) : null;
  let evaluatorStatus: "completed" | "unavailable" | "not_saved" = evaluation ? "completed" : "unavailable";
  const sessionId = typeof body.sessionId === "string" && body.sessionId.length <= 120 ? body.sessionId : "";
  const turnId = typeof body.turnId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(body.turnId) ? body.turnId : "";
  if (evaluation && sessionId && turnId) {
    try {
      const idempotencyKey = "conversation-eval:" + createHash("sha256").update(ownerId).update(":").update(sessionId).update(":").update(turnId).digest("hex");
      recordPracticeEvidence(ownerId, {
        source: "conversation",
        activityType: "conversation",
        activityRef: sessionId,
        skillKey: "speaking",
        responseText: latest,
        durationSeconds: 0,
        idempotencyKey,
        score: evaluation.score,
        confidence: 0.4,
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        corrections: feedback,
      });
    } catch {
      evaluatorStatus = "not_saved";
    }
  } else if (evaluation) {
    evaluatorStatus = "not_saved";
  }

  const response = NextResponse.json({
    reply: replyValue.trim().slice(0, 4_000),
    suggestions: suggestions(conversationResult.value.suggestions),
    corrections: feedback,
    vocabulary: words,
    evaluation: evaluation ? { ...evaluation, scorePercent: Math.round(evaluation.score * 100) } : null,
    agents: {
      learnerContext: learnerContextStatus,
      conversation: "completed",
      languageFeedback: feedbackResult.status === "fulfilled" ? "completed" : "unavailable",
      vocabulary: vocabularyResult.status === "fulfilled" ? "completed" : "unavailable",
      sessionEvaluator: evaluatorStatus,
    },
  }, { headers: { "Cache-Control": "no-store" } });
  return synchronizeOwnerCookie(response, request, ownerId);
}
