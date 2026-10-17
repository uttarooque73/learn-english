import { randomUUID } from "node:crypto";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { createOllamaProvider, ModelProvider, ModelProviderError } from "@/lib/ai/model-provider";

export const ACTIVITY_TYPES = ["conversation", "vocabulary", "grammar", "shadowing", "listening"] as const;
export type ActivityType = typeof ACTIVITY_TYPES[number];

export type PlannedActivity = {
  activityType: ActivityType;
  title: string;
  skillKey: string;
  durationMinutes: number;
  priority: number;
  reason: string;
};

export type DailyLearningPlan = {
  id: string;
  ownerId: string;
  localDate: string;
  status: string;
  version: number;
  generationSource: string;
  totalMinutes: number;
  createdAt: string;
  items: Array<PlannedActivity & { id: string; position: number; status: string }>;
};

export type PracticeEvaluation = {
  score: number;
  confidence: number;
  skillKey: string;
  feedback: string;
  strengths: string[];
  corrections: Array<{ original: string; improved: string; reason: string }>;
};

export type AttemptResult = {
  attemptId: string;
  duplicate: boolean;
  evaluation: PracticeEvaluation;
};

export class AdaptiveLearningError extends Error {
  constructor(
    readonly code: "invalid_owner" | "invalid_input" | "invalid_plan" | "plan_not_found" | "invalid_evaluation",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AdaptiveLearningError";
  }
}

type PlanRequest = { dailyTargetMinutes?: number; goal?: string };
type AttemptRequest = {
  planItemId: string;
  responseText: string;
  durationSeconds: number;
  idempotencyKey: string;
};

type ProfileRow = {
  timezone: string;
  daily_target_minutes: number;
  proficiency_level: string;
  goals_json: string;
  preferences_json: string;
};

type PlanRow = {
  id: string;
  owner_id: string;
  local_date: string;
  status: string;
  version: number;
  generation_source: string;
  total_minutes: number;
  created_at: string;
};

type PlanItemRow = {
  id: string;
  position: number;
  activity_type: ActivityType;
  activity_ref: string | null;
  skill_key: string | null;
  estimated_minutes: number;
  priority: number;
  reason_codes_json: string;
  status: string;
};

const MAX_ACTIVITIES = 12;
const MAX_RESPONSE_LENGTH = 4_000;
const SKILLS = ["speaking", "pronunciation", "grammar", "vocabulary", "listening", "fluency", "writing"] as const;

function assertOwner(ownerId: string): void {
  if (typeof ownerId !== "string" || !ownerId.trim() || ownerId.length > 200) {
    throw new AdaptiveLearningError("invalid_owner", "A valid learner owner is required.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

function isPlannedActivity(value: unknown): value is PlannedActivity {
  if (!isRecord(value)) return false;
  return isActivityType(value.activityType)
    && typeof value.title === "string" && value.title.trim().length > 0 && value.title.length <= 120
    && typeof value.skillKey === "string" && (SKILLS as readonly string[]).includes(value.skillKey)
    && Number.isInteger(value.durationMinutes) && Number(value.durationMinutes) >= 1 && Number(value.durationMinutes) <= 240
    && typeof value.priority === "number" && Number.isFinite(value.priority) && value.priority >= 0 && value.priority <= 1
    && typeof value.reason === "string" && value.reason.trim().length > 0 && value.reason.length <= 300;
}

function isPlanOutput(value: unknown): value is { activities: PlannedActivity[] } {
  return isRecord(value) && Array.isArray(value.activities)
    && value.activities.length > 0 && value.activities.length <= MAX_ACTIVITIES
    && value.activities.every(isPlannedActivity);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 8
    && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 240);
}

function isEvaluation(value: unknown): value is PracticeEvaluation {
  if (!isRecord(value)) return false;
  return typeof value.score === "number" && Number.isFinite(value.score) && value.score >= 0 && value.score <= 1
    && typeof value.confidence === "number" && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1
    && typeof value.skillKey === "string" && (SKILLS as readonly string[]).includes(value.skillKey)
    && typeof value.feedback === "string" && value.feedback.trim().length > 0 && value.feedback.length <= 1200
    && isStringList(value.strengths)
    && Array.isArray(value.corrections) && value.corrections.length <= 8
    && value.corrections.every((correction) => isRecord(correction)
      && typeof correction.original === "string" && correction.original.trim().length > 0 && correction.original.length <= 500
      && typeof correction.improved === "string" && correction.improved.trim().length > 0 && correction.improved.length <= 500
      && typeof correction.reason === "string" && correction.reason.trim().length > 0 && correction.reason.length <= 500);
}

function parseStringList(value: string, limit = 10): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().slice(0, 240)).slice(0, limit);
  } catch {
    return [];
  }
}

function localDateForZone(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function readProfile(ownerId: string): ProfileRow {
  const database = getDatabase();
  database.prepare(`
    INSERT OR IGNORE INTO learner_profiles (owner_id) VALUES (?)
  `).run(ownerId);
  return database.prepare(`
    SELECT timezone, daily_target_minutes, proficiency_level, goals_json, preferences_json
    FROM learner_profiles WHERE owner_id = ?
  `).get(ownerId) as ProfileRow;
}

function loadPlanningContext(ownerId: string, profile: ProfileRow) {
  const database = getDatabase();
  const scores = database.prepare(`
    SELECT skill_key AS skillKey, mastery, confidence, evidence_count AS evidenceCount
    FROM learner_skill_scores WHERE owner_id = ? ORDER BY evidence_count DESC, updated_at DESC LIMIT 12
  `).all(ownerId);
  const mistakes = database.prepare(`
    SELECT category, normalized_key AS normalizedKey, occurrence_count AS occurrenceCount
    FROM learning_mistakes WHERE owner_id = ? AND status = 'active'
    ORDER BY occurrence_count DESC, last_seen_at DESC LIMIT 8
  `).all(ownerId);
  const dueReviews = database.prepare(`
    SELECT COUNT(*) AS count FROM vocabulary_review_events
    WHERE owner_id = ? AND next_due_at IS NOT NULL AND next_due_at <= ?
  `).get(ownerId, new Date().toISOString()) as { count: number };
  const recentAttempts = database.prepare(`
    SELECT activity_type AS activityType, result_json AS resultJson, completed_at AS completedAt
    FROM practice_attempts WHERE owner_id = ? AND completed_at IS NOT NULL
    ORDER BY completed_at DESC LIMIT 8
  `).all(ownerId) as Array<{ activityType: string; resultJson: string; completedAt: string | null }>;

  return {
    timezone: profile.timezone,
    proficiencyLevel: profile.proficiency_level,
    goals: parseStringList(profile.goals_json),
    preferences: (() => {
      try { return JSON.parse(profile.preferences_json) as Record<string, unknown>; }
      catch { return {}; }
    })(),
    skills: scores,
    recurringMistakes: mistakes,
    dueVocabularyReviews: dueReviews.count,
    recentAttempts: recentAttempts.map((attempt) => {
      let score: number | null = null;
      try {
        const result = JSON.parse(attempt.resultJson) as Record<string, unknown>;
        if (typeof result.score === "number" && Number.isFinite(result.score)) score = result.score;
        else if (isRecord(result.evaluation) && typeof result.evaluation.score === "number") score = result.evaluation.score;
      } catch { /* Older or malformed result records are excluded from scoring context. */ }
      return { activityType: attempt.activityType, score, completedAt: attempt.completedAt };
    }),
  };
}

function mapPlanRow(row: PlanRow, items: PlanItemRow[]): DailyLearningPlan {
  return {
    id: row.id,
    ownerId: row.owner_id,
    localDate: row.local_date,
    status: row.status,
    version: row.version,
    generationSource: row.generation_source,
    totalMinutes: row.total_minutes,
    createdAt: row.created_at,
    items: items.map((item) => ({
      id: item.id,
      position: item.position,
      activityType: item.activity_type,
      title: item.activity_ref ?? item.activity_type,
      skillKey: item.skill_key ?? "speaking",
      durationMinutes: item.estimated_minutes,
      priority: item.priority,
      reason: parseStringList(item.reason_codes_json, 1)[0] ?? "Selected to support your learning goal.",
      status: item.status,
    })),
  };
}

function getPlanById(ownerId: string, planId: string): DailyLearningPlan | null {
  const database = getDatabase();
  const row = database.prepare(`
    SELECT id, owner_id, local_date, status, version, generation_source, total_minutes, created_at
    FROM learning_plans WHERE owner_id = ? AND id = ?
  `).get(ownerId, planId) as PlanRow | undefined;
  if (!row) return null;
  const items = database.prepare(`
    SELECT id, position, activity_type, activity_ref, skill_key, estimated_minutes,
      priority, reason_codes_json, status
    FROM learning_plan_items WHERE owner_id = ? AND plan_id = ? ORDER BY position ASC
  `).all(ownerId, planId) as PlanItemRow[];
  return mapPlanRow(row, items);
}

export function getCurrentLearningPlan(ownerId: string): DailyLearningPlan | null {
  assertOwner(ownerId);
  ensurePersistenceSchema();
  const profile = readProfile(ownerId);
  const localDate = localDateForZone(profile.timezone);
  const row = getDatabase().prepare(`
    SELECT id FROM learning_plans WHERE owner_id = ? AND local_date = ?
    ORDER BY version DESC LIMIT 1
  `).get(ownerId, localDate) as { id: string } | undefined;
  return row ? getPlanById(ownerId, row.id) : null;
}

export async function generateDailyLearningPlan(
  ownerId: string,
  request: PlanRequest = {},
  provider: ModelProvider = createOllamaProvider(),
): Promise<DailyLearningPlan> {
  assertOwner(ownerId);
  ensurePersistenceSchema();
  const database = getDatabase();
  const currentProfile = readProfile(ownerId);
  const targetMinutes = request.dailyTargetMinutes ?? currentProfile.daily_target_minutes;
  if (!Number.isInteger(targetMinutes) || targetMinutes < 5 || targetMinutes > 240) {
    throw new AdaptiveLearningError("invalid_input", "Daily target must be an integer between 5 and 240 minutes.");
  }
  if (request.goal !== undefined && (typeof request.goal !== "string" || !request.goal.trim() || request.goal.length > 500)) {
    throw new AdaptiveLearningError("invalid_input", "A learning goal must contain 1–500 characters.");
  }

  const goals = request.goal ? [request.goal.trim()] : parseStringList(currentProfile.goals_json);
  const normalizedGoals = goals.length ? goals : ["Improve everyday English communication"];
  const updatedProfile = {
    ...currentProfile,
    daily_target_minutes: targetMinutes,
    goals_json: JSON.stringify(normalizedGoals),
  };
  database.prepare(`
    UPDATE learner_profiles SET daily_target_minutes = ?, goals_json = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE owner_id = ?
  `).run(targetMinutes, updatedProfile.goals_json, ownerId);

  const context = loadPlanningContext(ownerId, updatedProfile);
  const prompt = [
    "You are an evidence-based English learning planner.",
    "Return JSON matching {activities:[{activityType,title,skillKey,durationMinutes,priority,reason}]}.",
    `Create a plan totaling no more than ${targetMinutes} minutes. Use 1 to ${MAX_ACTIVITIES} activities.`,
    "Allowed activityType values: conversation, vocabulary, grammar, shadowing, listening.",
    "Allowed skillKey values: speaking, pronunciation, grammar, vocabulary, listening, fluency, writing.",
    "Each durationMinutes must be an integer from 1 to 240. priority must be 0 to 1. Each reason must briefly cite the goal or supplied evidence.",
    "Do not claim mastery or improvement without saved evidence. Prefer due reviews and recurring mistakes when relevant.",
    `Learner goals: ${JSON.stringify(normalizedGoals)}`,
    `Daily target minutes: ${targetMinutes}`,
    `Learner evidence context: ${JSON.stringify(context)}`,
  ].join("\n");

  let generated: { activities: PlannedActivity[] };
  try {
    generated = await provider.generateJson(prompt, isPlanOutput);
  } catch (error) {
    if (error instanceof ModelProviderError) throw error;
    throw new AdaptiveLearningError("invalid_plan", "The planner could not produce a valid learning plan.", { cause: error });
  }
  const totalMinutes = generated.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0);
  if (totalMinutes > targetMinutes) {
    throw new AdaptiveLearningError("invalid_plan", "The generated plan exceeds the learner's daily time target.");
  }

  const planId = randomUUID();
  const localDate = localDateForZone(currentProfile.timezone);
  const createdAt = new Date().toISOString();

  const savePlan = database.transaction(() => {
    const nextVersion = (database.prepare(`
      SELECT COALESCE(MAX(version), 0) + 1 AS version
      FROM learning_plans WHERE owner_id = ? AND local_date = ?
    `).get(ownerId, localDate) as { version: number }).version;
    database.prepare(`
      INSERT INTO learning_plans (
        id, owner_id, local_date, status, version, generation_source, total_minutes, created_at, updated_at
      ) VALUES (?, ?, ?, 'published', ?, 'ai', ?, ?, ?)
    `).run(planId, ownerId, localDate, nextVersion, totalMinutes, createdAt, createdAt);

    const insertItem = database.prepare(`
      INSERT INTO learning_plan_items (
        id, plan_id, owner_id, position, activity_type, activity_ref, skill_key,
        estimated_minutes, priority, reason_codes_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    generated.activities.forEach((activity, position) => {
      insertItem.run(
        randomUUID(), planId, ownerId, position, activity.activityType, activity.title,
        activity.skillKey, activity.durationMinutes, activity.priority, JSON.stringify([activity.reason]),
      );
    });
  });
  savePlan();

  const saved = getPlanById(ownerId, planId);
  if (!saved) throw new AdaptiveLearningError("invalid_plan", "The generated plan could not be loaded after saving.");
  return saved;
}

function parseEvaluation(value: string): PracticeEvaluation | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isEvaluation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function evaluatePracticeAttempt(
  ownerId: string,
  request: AttemptRequest,
  provider: ModelProvider = createOllamaProvider(),
): Promise<AttemptResult> {
  assertOwner(ownerId);
  ensurePersistenceSchema();
  if (!request || typeof request.planItemId !== "string" || !request.planItemId.trim() || request.planItemId.length > 100
    || typeof request.responseText !== "string" || !request.responseText.trim() || request.responseText.length > MAX_RESPONSE_LENGTH
    || !Number.isInteger(request.durationSeconds) || request.durationSeconds < 0 || request.durationSeconds > 86_400
    || typeof request.idempotencyKey !== "string" || !request.idempotencyKey.trim() || request.idempotencyKey.length > 160) {
    throw new AdaptiveLearningError("invalid_input", "A plan item, response, valid duration, and idempotency key are required.");
  }

  const database = getDatabase();
  const prior = database.prepare(`
    SELECT id, result_json FROM practice_attempts WHERE owner_id = ? AND idempotency_key = ?
  `).get(ownerId, request.idempotencyKey) as { id: string; result_json: string } | undefined;
  if (prior) {
    const evaluation = parseEvaluation(prior.result_json);
    if (!evaluation) throw new AdaptiveLearningError("invalid_evaluation", "The saved evaluation could not be validated.");
    return { attemptId: prior.id, duplicate: true, evaluation };
  }

  const item = database.prepare(`
    SELECT id, owner_id, activity_type AS activityType, activity_ref AS activityRef, skill_key AS skillKey
    FROM learning_plan_items WHERE id = ? AND owner_id = ?
  `).get(request.planItemId, ownerId) as {
    id: string; owner_id: string; activityType: ActivityType; activityRef: string | null; skillKey: string | null;
  } | undefined;
  if (!item) throw new AdaptiveLearningError("plan_not_found", "The requested learning activity was not found.");

  const expectedSkill = item.skillKey ?? "speaking";
  const prompt = [
    "You are an English learning evaluator. Evaluate only the submitted response against the activity.",
    "Return JSON matching {score,confidence,skillKey,feedback,strengths,corrections}.",
    "score and confidence must be numbers from 0 to 1. strengths is an array of up to 8 short strings.",
    "corrections is an array of up to 8 {original,improved,reason} objects. Do not invent errors that are not in the response.",
    `Activity type: ${item.activityType}`,
    `Activity: ${item.activityRef ?? item.activityType}`,
    `Target skill: ${expectedSkill}`,
    `Learner response: ${request.responseText.trim()}`,
  ].join("\n");
  const evaluation = await provider.generateJson(prompt, isEvaluation);
  if (evaluation.skillKey !== expectedSkill && item.skillKey) {
    throw new AdaptiveLearningError("invalid_evaluation", "The evaluation skill did not match the activity's target skill.");
  }

  const attemptId = randomUUID();
  const now = new Date().toISOString();
  const responseJson = JSON.stringify({ text: request.responseText.trim() });
  const resultJson = JSON.stringify(evaluation);
  const persistEvidence = database.transaction(() => {
    const result = database.prepare(`
      INSERT OR IGNORE INTO practice_attempts (
        id, owner_id, plan_item_id, activity_type, activity_ref, response_json, result_json,
        duration_seconds, idempotency_key, submitted_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attemptId, ownerId, item.id, item.activityType, item.activityRef, responseJson,
      resultJson, request.durationSeconds, request.idempotencyKey, now, now,
    );
    if (result.changes === 0) {
      const existing = database.prepare(`
        SELECT id, result_json FROM practice_attempts WHERE owner_id = ? AND idempotency_key = ?
      `).get(ownerId, request.idempotencyKey) as { id: string; result_json: string } | undefined;
      return existing ? { attemptId: existing.id, evaluation: parseEvaluation(existing.result_json), inserted: false } : null;
    }

    database.prepare(`
      INSERT INTO skill_assessments (id, owner_id, skill_key, score, confidence, rubric_version, evidence_json)
      VALUES (?, ?, ?, ?, ?, 'v1', ?)
    `).run(randomUUID(), ownerId, evaluation.skillKey, evaluation.score, evaluation.confidence, JSON.stringify([attemptId]));

    database.prepare(`
      INSERT INTO learner_skill_scores (owner_id, skill_key, mastery, confidence, evidence_count, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(owner_id, skill_key) DO UPDATE SET
        mastery = ((learner_skill_scores.mastery * learner_skill_scores.evidence_count + excluded.mastery)
          / (learner_skill_scores.evidence_count + 1)),
        confidence = ((learner_skill_scores.confidence * learner_skill_scores.evidence_count + excluded.confidence)
          / (learner_skill_scores.evidence_count + 1)),
        evidence_count = learner_skill_scores.evidence_count + 1,
        updated_at = excluded.updated_at
    `).run(ownerId, evaluation.skillKey, evaluation.score, evaluation.confidence, now);

    database.prepare(`
      UPDATE learning_plan_items SET status = 'completed'
      WHERE id = ? AND owner_id = ?
    `).run(item.id, ownerId);

    for (const correction of evaluation.corrections) {
      const normalizedKey = correction.original.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 240);
      if (!normalizedKey) continue;
      const activeMistake = database.prepare(`
        SELECT id, occurrence_count AS occurrenceCount, evidence_json AS evidenceJson
        FROM learning_mistakes WHERE owner_id = ? AND normalized_key = ? AND status = 'active'
      `).get(ownerId, normalizedKey) as { id: string; occurrenceCount: number; evidenceJson: string } | undefined;
      if (activeMistake) {
        const evidence = parseStringList(activeMistake.evidenceJson, 100);
        if (!evidence.includes(attemptId)) evidence.push(attemptId);
        database.prepare(`
          UPDATE learning_mistakes SET occurrence_count = ?, last_seen_at = ?, evidence_json = ?
          WHERE id = ? AND owner_id = ?
        `).run(activeMistake.occurrenceCount + 1, now, JSON.stringify(evidence.slice(-100)), activeMistake.id, ownerId);
      } else {
        database.prepare(`
          INSERT INTO learning_mistakes (id, owner_id, category, normalized_key, evidence_json, first_seen_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), ownerId, evaluation.skillKey, normalizedKey, JSON.stringify([attemptId]), now, now);
      }
    }

    return { attemptId, evaluation, inserted: true };
  });

  const saved = persistEvidence();
  if (!saved || !saved.evaluation) throw new AdaptiveLearningError("invalid_evaluation", "The evaluation evidence could not be saved.");
  return { attemptId: saved.attemptId, duplicate: !saved.inserted, evaluation: saved.evaluation };
}
