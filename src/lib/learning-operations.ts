import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { getLearningJobStats } from "@/lib/learning-jobs";

type StatusCount = { status: string; count: number };
type ErrorCount = { errorCode: string; count: number };

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

/**
 * Aggregate operational signals without returning learner IDs, prompts, answers,
 * job payloads, or checkpoint contents. Intended for authenticated operators only.
 */
export function getLearningOperationsSnapshot(now = new Date()): {
  generatedAt: string;
  windowHours: 24;
  queue: ReturnType<typeof getLearningJobStats>;
  workflows: {
    recentRuns: number;
    completed: number;
    failed: number;
    running: number;
    failureRate: number;
    durationMs: { p50: number | null; p95: number | null; max: number | null };
    failuresByCode: ErrorCount[];
  };
  jobs: {
    recentAttempts: number;
    completed: number;
    retrying: number;
    failed: number;
    failuresByCode: ErrorCount[];
  };
} {
  ensurePersistenceSchema();
  const database = getDatabase();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const workflowRows = database.prepare(`
    SELECT status, COUNT(*) AS count FROM agent_runs
    WHERE created_at >= ? GROUP BY status
  `).all(cutoff) as StatusCount[];
  const workflowCounts = new Map(workflowRows.map(row => [row.status, row.count]));
  const workflowFailures = database.prepare(`
    SELECT error_code AS errorCode, COUNT(*) AS count FROM agent_runs
    WHERE created_at >= ? AND status = 'failed' AND error_code IS NOT NULL
    GROUP BY error_code ORDER BY count DESC, error_code ASC LIMIT 10
  `).all(cutoff) as ErrorCount[];
  const durations = database.prepare(`
    SELECT duration_ms AS durationMs FROM agent_runs
    WHERE created_at >= ? AND status = 'completed' AND duration_ms IS NOT NULL
    ORDER BY duration_ms ASC LIMIT 500
  `).all(cutoff) as Array<{ durationMs: number }>;
  const durationValues = durations.map(row => row.durationMs).filter(value => Number.isFinite(value) && value >= 0);
  const completed = workflowCounts.get("completed") ?? 0;
  const failed = workflowCounts.get("failed") ?? 0;
  const total = workflowRows.reduce((sum, row) => sum + row.count, 0);
  const jobRows = database.prepare(`
    SELECT status, COUNT(*) AS count FROM learning_job_attempts
    WHERE created_at >= ? GROUP BY status
  `).all(cutoff) as StatusCount[];
  const jobCounts = new Map(jobRows.map(row => [row.status, row.count]));
  const jobFailures = database.prepare(`
    SELECT error_code AS errorCode, COUNT(*) AS count FROM learning_job_attempts
    WHERE created_at >= ? AND status IN ('failed', 'retrying') AND error_code IS NOT NULL
    GROUP BY error_code ORDER BY count DESC, error_code ASC LIMIT 10
  `).all(cutoff) as ErrorCount[];

  return {
    generatedAt: now.toISOString(),
    windowHours: 24,
    queue: getLearningJobStats(),
    workflows: {
      recentRuns: total,
      completed,
      failed,
      running: workflowCounts.get("running") ?? 0,
      failureRate: total === 0 ? 0 : Number((failed / total).toFixed(4)),
      durationMs: {
        p50: percentile(durationValues, 0.5),
        p95: percentile(durationValues, 0.95),
        max: durationValues.length ? Math.max(...durationValues) : null,
      },
      failuresByCode: workflowFailures,
    },
    jobs: {
      recentAttempts: jobRows.reduce((sum, row) => sum + row.count, 0),
      completed: jobCounts.get("completed") ?? 0,
      retrying: jobCounts.get("retrying") ?? 0,
      failed: jobCounts.get("failed") ?? 0,
      failuresByCode: jobFailures,
    },
  };
}

/** Backwards-compatible default: only an explicit false value pauses automation. */
export function isLearningAutomationEnabled(value = process.env.LEARNING_AUTOMATION_ENABLED): boolean {
  return value !== "false" && value !== "0";
}
