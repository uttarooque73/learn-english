import { createHash, randomUUID } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { AdaptiveLearningError, generateDailyLearningPlan, type DailyLearningPlan } from "@/lib/ai/adaptive-learning";
import { ensurePersistenceSchema, getDatabase, getDatabasePath } from "@/lib/database";

const WORKFLOW_NAME = "adaptive-multi-agent-learning";
const GRAPH_VERSION = "v2";
const MAX_GOAL_LENGTH = 350;

type SkillEvidence = { skillKey: string; mastery: number; confidence: number; evidenceCount: number };
type MistakeEvidence = { category: string; normalizedKey: string; occurrenceCount: number };
type LearningContext = {
  proficiencyLevel: string;
  dailyTargetMinutes: number;
  skills: SkillEvidence[];
  mistakes: MistakeEvidence[];
  dueVocabularyReviews: number;
  recentScores: number[];
};
export type LearningDiagnosis = {
  focusSkills: string[];
  reasons: string[];
  confidence: "low" | "medium" | "high";
  dueVocabularyReviews: number;
};
type AgentState = {
  ownerId: string;
  runId: string;
  goal: string;
  dailyTargetMinutes: number;
  contextJson: string;
  diagnosisJson: string;
  plannerGoal: string;
  reviewPriority: string;
  planJson: string;
  summary: string;
  agentSequence: string[];
  status: "running" | "completed" | "failed";
};

type WorkflowGlobals = typeof globalThis & {
  speakupMultiAgentCheckpointer?: SqliteSaver;
};
const workflowGlobals = globalThis as WorkflowGlobals;

export class MultiAgentLearningError extends Error {
  constructor(
    readonly code: "invalid_owner" | "invalid_input" | "workflow_failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MultiAgentLearningError";
  }
}

const AgentStateAnnotation = Annotation.Root({
  ownerId: Annotation<string>(),
  runId: Annotation<string>(),
  goal: Annotation<string>(),
  dailyTargetMinutes: Annotation<number>(),
  contextJson: Annotation<string>(),
  diagnosisJson: Annotation<string>(),
  plannerGoal: Annotation<string>(),
  reviewPriority: Annotation<string>(),
  planJson: Annotation<string>(),
  summary: Annotation<string>(),
  agentSequence: Annotation<string[]>(),
  status: Annotation<"running" | "completed" | "failed">(),
});

function getCheckpointer(): SqliteSaver {
  ensurePersistenceSchema();
  if (!workflowGlobals.speakupMultiAgentCheckpointer) {
    workflowGlobals.speakupMultiAgentCheckpointer = SqliteSaver.fromConnString(getDatabasePath());
  }
  return workflowGlobals.speakupMultiAgentCheckpointer;
}

function threadIdFor(ownerId: string, runId: string): string {
  return createHash("sha256").update(ownerId).update(":").update(runId).digest("hex");
}

function configFor(ownerId: string, runId: string) {
  return { configurable: { thread_id: threadIdFor(ownerId, runId) } };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Deterministic diagnostic: every recommendation is grounded in saved evidence. */
export function diagnoseLearningContext(context: LearningContext): LearningDiagnosis {
  const focusSkills = new Set<string>();
  const reasons: string[] = [];
  for (const skill of [...context.skills].sort((a, b) => a.mastery - b.mastery)) {
    if (skill.evidenceCount > 0 && skill.confidence >= 0.25 && skill.mastery < 0.7) {
      focusSkills.add(skill.skillKey);
      if (reasons.length < 4) reasons.push(`${skill.skillKey} has a saved mastery estimate of ${Math.round(skill.mastery * 100)}%.`);
    }
    if (focusSkills.size >= 3) break;
  }
  for (const mistake of context.mistakes.slice(0, 2)) {
    focusSkills.add(mistake.category);
    if (reasons.length < 4) reasons.push(`Recurring ${mistake.category} issue observed ${mistake.occurrenceCount} times.`);
  }
  if (context.dueVocabularyReviews > 0) {
    focusSkills.add("vocabulary");
    reasons.unshift(`${context.dueVocabularyReviews} vocabulary review(s) are due.`);
  }
  if (focusSkills.size === 0) {
    focusSkills.add("speaking");
    focusSkills.add("vocabulary");
    reasons.push(context.skills.length === 0
      ? "There is not enough saved assessment evidence yet; start with balanced foundational practice."
      : "Saved evidence does not identify a high-confidence weak skill; use a balanced practice mix.");
  }
  const evidenceCount = context.skills.reduce((sum, skill) => sum + skill.evidenceCount, 0);
  return {
    focusSkills: [...focusSkills].slice(0, 5),
    reasons: reasons.slice(0, 5),
    confidence: evidenceCount >= 12 ? "high" : evidenceCount >= 4 ? "medium" : "low",
    dueVocabularyReviews: context.dueVocabularyReviews,
  };
}

export function summarizeLearningPlan(plan: DailyLearningPlan, diagnosis: LearningDiagnosis): string {
  const activityCount = plan.items.length;
  const types = [...new Set(plan.items.map((item) => item.activityType))];
  const focus = diagnosis.focusSkills.length ? diagnosis.focusSkills.join(", ") : "balanced practice";
  return `Created a ${plan.totalMinutes}-minute plan with ${activityCount} activities across ${types.join(", ") || "practice"}; priorities: ${focus}. ${diagnosis.reasons[0] ?? "Recommendations use the learner's saved profile and practice context"}`;
}

function readLearningContext(ownerId: string): LearningContext {
  ensurePersistenceSchema();
  const database = getDatabase();
  database.prepare("INSERT OR IGNORE INTO learner_profiles (owner_id) VALUES (?)").run(ownerId);
  const profile = database.prepare(`
    SELECT proficiency_level AS proficiencyLevel, daily_target_minutes AS dailyTargetMinutes
    FROM learner_profiles WHERE owner_id = ?
  `).get(ownerId) as { proficiencyLevel: string; dailyTargetMinutes: number };
  const skills = database.prepare(`
    SELECT skill_key AS skillKey, mastery, confidence, evidence_count AS evidenceCount
    FROM learner_skill_scores WHERE owner_id = ? ORDER BY mastery ASC LIMIT 12
  `).all(ownerId) as SkillEvidence[];
  const mistakes = database.prepare(`
    SELECT category, normalized_key AS normalizedKey, occurrence_count AS occurrenceCount
    FROM learning_mistakes WHERE owner_id = ? AND status = 'active'
    ORDER BY occurrence_count DESC, last_seen_at DESC LIMIT 8
  `).all(ownerId) as MistakeEvidence[];
  const due = database.prepare(`
    SELECT COUNT(*) AS count FROM vocabulary_review_events
    WHERE owner_id = ? AND next_due_at IS NOT NULL AND next_due_at <= ?
  `).get(ownerId, new Date().toISOString()) as { count: number };
  const attempts = database.prepare(`
    SELECT result_json AS resultJson FROM practice_attempts
    WHERE owner_id = ? AND completed_at IS NOT NULL
    ORDER BY completed_at DESC LIMIT 8
  `).all(ownerId) as Array<{ resultJson: string }>;
  const recentScores = attempts.flatMap(({ resultJson }) => {
    const result = parseJson<Record<string, unknown>>(resultJson, {});
    const evaluation = result.evaluation && typeof result.evaluation === "object"
      ? result.evaluation as Record<string, unknown> : result;
    return typeof evaluation.score === "number" && Number.isFinite(evaluation.score)
      ? [Math.max(0, Math.min(1, evaluation.score))] : [];
  });
  return {
    proficiencyLevel: profile.proficiencyLevel,
    dailyTargetMinutes: profile.dailyTargetMinutes,
    skills,
    mistakes,
    dueVocabularyReviews: due.count,
    recentScores,
  };
}

function updateRun(ownerId: string, runId: string, status: "completed" | "failed", startedAt: number, errorCode: string | null = null): void {
  const now = new Date().toISOString();
  getDatabase().prepare(`
    UPDATE agent_runs SET status = ?, finished_at = ?, duration_ms = ?, error_code = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE owner_id = ? AND run_id = ?
  `).run(status, now, Math.max(0, Date.now() - startedAt), errorCode, ownerId, runId);
}

function buildMultiAgentGraph(checkpointer: SqliteSaver) {
  return new StateGraph(AgentStateAnnotation)
    .addNode("contextLoader", (state) => {
      const context = readLearningContext(state.ownerId);
      return {
        contextJson: JSON.stringify(context),
        dailyTargetMinutes: state.dailyTargetMinutes || context.dailyTargetMinutes,
        agentSequence: [...state.agentSequence, "context-loader"],
      };
    })
    .addNode("diagnosticAgent", (state) => {
      const context = parseJson<LearningContext>(state.contextJson, {
        proficiencyLevel: "beginner", dailyTargetMinutes: 15, skills: [], mistakes: [],
        dueVocabularyReviews: 0, recentScores: [],
      });
      const diagnosis = diagnoseLearningContext(context);
      const goal = state.goal.trim().replace(/\s+/g, " ");
      return {
        diagnosisJson: JSON.stringify(diagnosis),
        plannerGoal: `${goal}\nEvidence-based focus suggestions: ${diagnosis.focusSkills.join(", ")}. Reasons: ${diagnosis.reasons.join(" ")}. Treat these as priorities, not as claims beyond the saved evidence.`.slice(0, 500),
        agentSequence: [...state.agentSequence, "diagnostic-agent"],
      };
    })
    .addNode("vocabularyReviewAgent", (state) => {
      const diagnosis = parseJson<LearningDiagnosis>(state.diagnosisJson, {
        focusSkills: ["vocabulary"], reasons: [], confidence: "low", dueVocabularyReviews: 0,
      });
      return {
        reviewPriority: diagnosis.dueVocabularyReviews > 0
          ? `Schedule vocabulary review early: ${diagnosis.dueVocabularyReviews} review(s) are due.`
          : "No overdue vocabulary reviews were found; do not force a review-only plan.",
        plannerGoal: `${state.plannerGoal}\nVocabulary review routing: ${diagnosis.dueVocabularyReviews > 0 ? "include due review work where suitable" : "normal vocabulary allocation"}.`,
        agentSequence: [...state.agentSequence, "vocabulary-review-agent"],
      };
    })
    .addNode("plannerAgent", async (state) => {
      const plan = await generateDailyLearningPlan(state.ownerId, {
        dailyTargetMinutes: state.dailyTargetMinutes,
        goal: state.plannerGoal,
        generationSource: "ai",
      });
      return {
        planJson: JSON.stringify(plan),
        agentSequence: [...state.agentSequence, "practice-planner-agent"],
      };
    })
    .addNode("progressAnalyst", (state) => {
      const plan = parseJson<DailyLearningPlan | null>(state.planJson, null);
      if (!plan) throw new MultiAgentLearningError("workflow_failed", "The planner returned no valid saved plan.");
      const diagnosis = parseJson<LearningDiagnosis>(state.diagnosisJson, {
        focusSkills: [], reasons: [], confidence: "low", dueVocabularyReviews: 0,
      });
      return {
        summary: summarizeLearningPlan(plan, diagnosis),
        status: "completed" as const,
        agentSequence: [...state.agentSequence, "progress-analyst"],
      };
    })
    .addEdge(START, "contextLoader")
    .addEdge("contextLoader", "diagnosticAgent")
    .addConditionalEdges("diagnosticAgent", (state) => {
      const diagnosis = parseJson<LearningDiagnosis>(state.diagnosisJson, {
        focusSkills: [], reasons: [], confidence: "low", dueVocabularyReviews: 0,
      });
      return diagnosis.dueVocabularyReviews > 0 ? "vocabularyReviewAgent" : "plannerAgent";
    }, {
      vocabularyReviewAgent: "vocabularyReviewAgent",
      plannerAgent: "plannerAgent",
    })
    .addEdge("vocabularyReviewAgent", "plannerAgent")
    .addEdge("plannerAgent", "progressAnalyst")
    .addEdge("progressAnalyst", END)
    .compile({ checkpointer });
}

export async function runMultiAgentLearningWorkflow(
  ownerId: string,
  input: { goal?: string; dailyTargetMinutes?: number } = {},
): Promise<{
  runId: string;
  plan: DailyLearningPlan;
  diagnosis: LearningDiagnosis;
  summary: string;
  agents: string[];
}> {
  if (typeof ownerId !== "string" || !ownerId.trim() || ownerId.length > 200) {
    throw new MultiAgentLearningError("invalid_owner", "A valid learner owner is required.");
  }
  const goal = typeof input.goal === "string" ? input.goal.trim() : "Improve everyday English communication";
  if (!goal || goal.length > MAX_GOAL_LENGTH) {
    throw new MultiAgentLearningError("invalid_input", "A learning goal must contain 1–1000 characters.");
  }
  if (input.dailyTargetMinutes !== undefined
    && (!Number.isInteger(input.dailyTargetMinutes) || input.dailyTargetMinutes < 5 || input.dailyTargetMinutes > 240)) {
    throw new MultiAgentLearningError("invalid_input", "Daily target must be an integer between 5 and 240 minutes.");
  }

  ensurePersistenceSchema();
  const runId = randomUUID();
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const inputHash = createHash("sha256").update(JSON.stringify({ goal, dailyTargetMinutes: input.dailyTargetMinutes ?? null })).digest("hex");
  getDatabase().prepare(`
    INSERT INTO agent_runs (run_id, owner_id, workflow_name, graph_version, status, input_hash, started_at)
    VALUES (?, ?, ?, ?, 'running', ?, ?)
  `).run(runId, ownerId, WORKFLOW_NAME, GRAPH_VERSION, inputHash, startedAtIso);

  try {
    const graph = buildMultiAgentGraph(getCheckpointer());
    const result = await graph.invoke({
      ownerId, runId, goal,
      dailyTargetMinutes: input.dailyTargetMinutes ?? 0,
      contextJson: "", diagnosisJson: "", plannerGoal: "", reviewPriority: "",
      planJson: "", summary: "", agentSequence: [], status: "running",
    }, configFor(ownerId, runId)) as AgentState;
    const plan = parseJson<DailyLearningPlan | null>(result.planJson, null);
    const diagnosis = parseJson<LearningDiagnosis | null>(result.diagnosisJson, null);
    if (result.status !== "completed" || !plan || !diagnosis) {
      throw new MultiAgentLearningError("workflow_failed", "The multi-agent learning workflow did not complete.");
    }
    updateRun(ownerId, runId, "completed", startedAt);
    return { runId, plan, diagnosis, summary: result.summary, agents: result.agentSequence };
  } catch (error) {
    const errorCode = error instanceof AdaptiveLearningError ? error.code
      : error instanceof MultiAgentLearningError ? error.code : "workflow_failed";
    updateRun(ownerId, runId, "failed", startedAt, errorCode);
    if (error instanceof AdaptiveLearningError || error instanceof MultiAgentLearningError) throw error;
    throw new MultiAgentLearningError("workflow_failed", "The multi-agent learning workflow failed safely.", { cause: error });
  }
}

export function resetMultiAgentLearningForTests(): void {
  workflowGlobals.speakupMultiAgentCheckpointer?.db.close();
  delete workflowGlobals.speakupMultiAgentCheckpointer;
}
