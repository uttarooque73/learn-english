import { createHash, randomUUID } from "node:crypto";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ensurePersistenceSchema, getDatabase, getDatabasePath } from "@/lib/database";

const WORKFLOW_NAME = "learning-foundation";
const GRAPH_VERSION = "v1";
const MAX_GOAL_LENGTH = 1_000;

type WorkflowStatus = "running" | "completed" | "failed";
type WorkflowResult = { accepted: true; normalizedGoal: string };
type WorkflowState = {
  ownerId: string;
  runId: string;
  goal: string;
  normalizedGoal: string;
  status: WorkflowStatus;
  resultJson: string;
};

type WorkflowRunRecord = {
  runId: string;
  workflowName: string;
  graphVersion: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  createdAt: string;
};

type DatabaseWorkflowRun = {
  run_id: string;
  workflow_name: string;
  graph_version: string;
  status: WorkflowRunRecord["status"];
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
};

type WorkflowGlobals = typeof globalThis & {
  speakupLearningCheckpointer?: SqliteSaver;
};

const workflowGlobals = globalThis as WorkflowGlobals;

export class LearningWorkflowError extends Error {
  constructor(
    readonly code: "invalid_owner" | "invalid_input" | "checkpoint_missing" | "workflow_failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LearningWorkflowError";
  }
}

const LearningWorkflowState = Annotation.Root({
  ownerId: Annotation<string>(),
  runId: Annotation<string>(),
  goal: Annotation<string>(),
  normalizedGoal: Annotation<string>(),
  status: Annotation<WorkflowStatus>(),
  resultJson: Annotation<string>(),
});

function getCheckpointer(): SqliteSaver {
  ensurePersistenceSchema();
  if (!workflowGlobals.speakupLearningCheckpointer) {
    workflowGlobals.speakupLearningCheckpointer = SqliteSaver.fromConnString(getDatabasePath());
  }
  return workflowGlobals.speakupLearningCheckpointer;
}

function threadIdFor(ownerId: string, runId: string): string {
  return createHash("sha256").update(ownerId).update(":").update(runId).digest("hex");
}

function configFor(ownerId: string, runId: string) {
  return { configurable: { thread_id: threadIdFor(ownerId, runId) } };
}

export function createLearningWorkflowGraph(checkpointer: SqliteSaver = getCheckpointer()) {
  return new StateGraph(LearningWorkflowState)
    .addNode("validateInput", (state) => {
      const ownerId = state.ownerId.trim();
      const goal = typeof state.goal === "string" ? state.goal.trim().replace(/\s+/g, " ") : "";
      if (!ownerId || ownerId.length > 200) {
        throw new LearningWorkflowError("invalid_owner", "A valid learner owner is required.");
      }
      if (!goal || goal.length > MAX_GOAL_LENGTH) {
        throw new LearningWorkflowError("invalid_input", "A learning goal must contain 1–1000 characters.");
      }
      return { ownerId, normalizedGoal: goal, status: "running" as const };
    })
    .addNode("complete", (state) => {
      const result: WorkflowResult = { accepted: true, normalizedGoal: state.normalizedGoal };
      return { status: "completed" as const, resultJson: JSON.stringify(result) };
    })
    .addEdge(START, "validateInput")
    .addEdge("validateInput", "complete")
    .addEdge("complete", END)
    .compile({ checkpointer });
}

function toPublicRun(row: DatabaseWorkflowRun): WorkflowRunRecord {
  return {
    runId: row.run_id,
    workflowName: row.workflow_name,
    graphVersion: row.graph_version,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    errorCode: row.error_code,
    createdAt: row.created_at,
  };
}

function readRunRow(ownerId: string, runId: string): DatabaseWorkflowRun | undefined {
  return getDatabase().prepare(`
    SELECT run_id, workflow_name, graph_version, status, started_at, finished_at,
      duration_ms, error_code, created_at
    FROM agent_runs
    WHERE owner_id = ? AND run_id = ?
  `).get(ownerId, runId) as DatabaseWorkflowRun | undefined;
}

function updateRun(
  ownerId: string,
  runId: string,
  status: "completed" | "failed",
  startedAtMs: number,
  errorCode: string | null = null,
): void {
  const finishedAt = new Date().toISOString();
  getDatabase().prepare(`
    UPDATE agent_runs
    SET status = ?, finished_at = ?, duration_ms = ?, error_code = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE owner_id = ? AND run_id = ?
  `).run(status, finishedAt, Math.max(0, Date.now() - startedAtMs), errorCode, ownerId, runId);
}

function safeErrorCode(error: unknown): string {
  if (error instanceof LearningWorkflowError) return error.code;
  return "workflow_failed";
}

export async function runLearningWorkflow(ownerId: string, goal: string): Promise<{
  run: WorkflowRunRecord;
  result: WorkflowResult;
}> {
  if (typeof ownerId !== "string" || !ownerId.trim() || ownerId.length > 200) {
    throw new LearningWorkflowError("invalid_owner", "A valid learner owner is required.");
  }
  ensurePersistenceSchema();

  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const inputHash = createHash("sha256").update(typeof goal === "string" ? goal : "").digest("hex");
  getDatabase().prepare(`
    INSERT INTO agent_runs (
      run_id, owner_id, workflow_name, graph_version, status, input_hash, started_at
    ) VALUES (?, ?, ?, ?, 'running', ?, ?)
  `).run(runId, ownerId, WORKFLOW_NAME, GRAPH_VERSION, inputHash, startedAt);

  try {
    const graph = createLearningWorkflowGraph();
    const state = await graph.invoke({
      ownerId,
      runId,
      goal: typeof goal === "string" ? goal : "",
      normalizedGoal: "",
      status: "running",
      resultJson: "",
    }, configFor(ownerId, runId)) as WorkflowState;
    if (state.status !== "completed" || !state.resultJson) {
      throw new LearningWorkflowError("workflow_failed", "The learning workflow did not complete successfully.");
    }

    updateRun(ownerId, runId, "completed", startedAtMs);
    const row = readRunRow(ownerId, runId);
    if (!row) throw new LearningWorkflowError("workflow_failed", "The workflow run could not be read after completion.");
    return { run: toPublicRun(row), result: JSON.parse(state.resultJson) as WorkflowResult };
  } catch (error) {
    updateRun(ownerId, runId, "failed", startedAtMs, safeErrorCode(error));
    if (error instanceof LearningWorkflowError) throw error;
    throw new LearningWorkflowError("workflow_failed", "The learning workflow failed safely.", { cause: error });
  }
}

/** Resume an interrupted graph only after verifying the run belongs to this learner. */
export async function resumeLearningWorkflow(ownerId: string, runId: string): Promise<WorkflowRunRecord | null> {
  if (typeof ownerId !== "string" || !ownerId.trim() || ownerId.length > 200) {
    throw new LearningWorkflowError("invalid_owner", "A valid learner owner is required.");
  }
  if (typeof runId !== "string" || !runId.trim() || runId.length > 100) return null;

  ensurePersistenceSchema();
  const row = readRunRow(ownerId, runId);
  if (!row) return null;
  if (row.status !== "running") return toPublicRun(row);

  const startedAtMs = row.started_at ? Date.parse(row.started_at) : Date.now();
  try {
    const graph = createLearningWorkflowGraph();
    const config = configFor(ownerId, runId);
    const snapshot = await graph.getState(config);
    if (!snapshot || !snapshot.values || Object.keys(snapshot.values).length === 0) {
      throw new LearningWorkflowError("checkpoint_missing", "No resumable checkpoint exists for this workflow.");
    }
    let state = snapshot.values as WorkflowState;
    if (snapshot.next.length > 0) {
      state = await graph.invoke(null as never, config) as WorkflowState;
    }
    if (state.status === "completed") {
      updateRun(ownerId, runId, "completed", startedAtMs);
    }
  } catch (error) {
    updateRun(ownerId, runId, "failed", startedAtMs, safeErrorCode(error));
    if (error instanceof LearningWorkflowError) throw error;
    throw new LearningWorkflowError("workflow_failed", "The learning workflow could not be resumed safely.", { cause: error });
  }

  const refreshed = readRunRow(ownerId, runId);
  return refreshed ? toPublicRun(refreshed) : null;
}

/** Test-only reset for isolating file-backed checkpoint databases between tests. */
export function resetLearningWorkflowForTests(): void {
  workflowGlobals.speakupLearningCheckpointer?.db.close();
  delete workflowGlobals.speakupLearningCheckpointer;
}
