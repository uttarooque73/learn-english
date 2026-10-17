import { createHash, randomUUID } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { AdaptiveLearningError, evaluatePracticeAttempt, type AttemptResult } from "@/lib/ai/adaptive-learning";
import { ModelProviderError, type ModelProvider } from "@/lib/ai/model-provider";
import { ensurePersistenceSchema, getDatabase, getDatabasePath } from "@/lib/database";

export type EvaluationInput = {
  planItemId: string;
  responseText: string;
  durationSeconds: number;
  idempotencyKey: string;
};

type EvaluationState = {
  ownerId: string;
  inputJson: string;
  attemptJson: string;
  summary: string;
  agents: string[];
  status: "running" | "completed";
};
const State = Annotation.Root({
  ownerId: Annotation<string>(),
  inputJson: Annotation<string>(),
  attemptJson: Annotation<string>(),
  summary: Annotation<string>(),
  agents: Annotation<string[]>(),
  status: Annotation<"running" | "completed">(),
});
type Globals = typeof globalThis & { speakupEvaluationSaver?: SqliteSaver };
const globals = globalThis as Globals;

function saver(): SqliteSaver {
  ensurePersistenceSchema();
  globals.speakupEvaluationSaver ??= SqliteSaver.fromConnString(getDatabasePath());
  return globals.speakupEvaluationSaver;
}
function safeParse<T>(json: string): T | null {
  try { return JSON.parse(json) as T; } catch { return null; }
}

export async function runMultiAgentEvaluation(
  ownerId: string,
  input: EvaluationInput,
  provider?: ModelProvider,
): Promise<{ runId: string; attempt: AttemptResult; summary: string; agents: string[] }> {
  if (typeof ownerId !== "string" || !ownerId.trim() || ownerId.length > 200) {
    throw new AdaptiveLearningError("invalid_owner", "A valid learner owner is required.");
  }
  ensurePersistenceSchema();
  const runId = randomUUID();
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  getDatabase().prepare(`
    INSERT INTO agent_runs (run_id, owner_id, workflow_name, graph_version, status, input_hash, started_at)
    VALUES (?, ?, 'adaptive-multi-agent-evaluation', 'v2', 'running', ?, ?)
  `).run(runId, ownerId, inputHash, startedIso);

  const graph = new StateGraph(State)
    .addNode("evaluationAgent", async (state) => {
      const request = safeParse<EvaluationInput>(state.inputJson);
      if (!request) throw new Error("Invalid evaluation input.");
      const attempt = await evaluatePracticeAttempt(state.ownerId, request, provider);
      return { attemptJson: JSON.stringify(attempt), agents: [...state.agents, "evaluation-agent"] };
    })
    .addNode("progressAnalyst", (state) => {
      const attempt = safeParse<AttemptResult>(state.attemptJson);
      if (!attempt) throw new Error("Evaluator returned no valid attempt.");
      return {
        summary: `Evaluation ${attempt.duplicate ? "already existed" : "saved"} for ${attempt.evaluation.skillKey}: ${Math.round(attempt.evaluation.score * 100)}% score, ${Math.round(attempt.evaluation.confidence * 100)}% confidence.`,
        status: "completed" as const,
        agents: [...state.agents, "progress-analyst"],
      };
    })
    .addEdge(START, "evaluationAgent")
    .addEdge("evaluationAgent", "progressAnalyst")
    .addEdge("progressAnalyst", END)
    .compile({ checkpointer: saver() });

  try {
    const result = await graph.invoke({
      ownerId, inputJson: JSON.stringify(input), attemptJson: "", summary: "", agents: [], status: "running",
    }, { configurable: { thread_id: createHash("sha256").update(ownerId).update(":").update(runId).digest("hex") } }) as EvaluationState;
    const attempt = safeParse<AttemptResult>(result.attemptJson);
    if (result.status !== "completed" || !attempt) throw new Error("Evaluation graph did not complete.");
    getDatabase().prepare(`
      UPDATE agent_runs SET status = 'completed', finished_at = ?, duration_ms = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE owner_id = ? AND run_id = ?
    `).run(new Date().toISOString(), Math.max(0, Date.now() - startedAt), ownerId, runId);
    return { runId, attempt, summary: result.summary, agents: result.agents };
  } catch (error) {
    const code = error instanceof AdaptiveLearningError || error instanceof ModelProviderError
      ? error.code : "workflow_failed";
    getDatabase().prepare(`
      UPDATE agent_runs SET status = 'failed', finished_at = ?, duration_ms = ?, error_code = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE owner_id = ? AND run_id = ?
    `).run(new Date().toISOString(), Math.max(0, Date.now() - startedAt), code, ownerId, runId);
    if (error instanceof AdaptiveLearningError || error instanceof ModelProviderError) throw error;
    throw error;
  }
}

export function resetMultiAgentEvaluationForTests(): void {
  globals.speakupEvaluationSaver?.db.close();
  delete globals.speakupEvaluationSaver;
}
