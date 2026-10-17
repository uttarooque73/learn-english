import { randomUUID } from "node:crypto";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";
import { generateDailyLearningPlan, AdaptiveLearningError } from "@/lib/ai/adaptive-learning";
import { ModelProviderError } from "@/lib/ai/model-provider";

export type LearningJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type LearningJob = {
  id: string;
  ownerId: string;
  jobType: string;
  payload: Record<string, unknown>;
  status: LearningJobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leaseExpiresAt: string | null;
  claimedBy: string | null;
  lastErrorCode: string | null;
  createdAt: string;
};

type JobRow = {
  id: string;
  owner_id: string;
  job_type: string;
  payload_json: string;
  status: LearningJobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  available_at: string;
  lease_expires_at: string | null;
  claimed_by: string | null;
  last_error_code: string | null;
  created_at: string;
};

type EnqueueOptions = {
  idempotencyKey: string;
  priority?: number;
  maxAttempts?: number;
  availableAt?: string;
};

type ScheduledProfile = {
  owner_id: string;
  timezone: string;
  daily_target_minutes: number;
  goals_json: string;
};

const LEASE_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;
const MAX_PAYLOAD_LENGTH = 32_000;

function nowIso(): string {
  return new Date().toISOString();
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

function mapJob(row: JobRow): LearningJob {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.payload_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch { /* Invalid payloads remain empty and will fail with a bounded error code in the worker. */ }
  return {
    id: row.id,
    ownerId: row.owner_id,
    jobType: row.job_type,
    payload,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    leaseExpiresAt: row.lease_expires_at,
    claimedBy: row.claimed_by,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
  };
}

export function enqueueLearningJob(
  ownerId: string,
  jobType: string,
  payload: Record<string, unknown>,
  options: EnqueueOptions,
): LearningJob {
  if (typeof ownerId !== "string" || !ownerId.trim() || ownerId.length > 200
    || typeof jobType !== "string" || !/^[a-z][a-z0-9_]{1,79}$/.test(jobType)
    || !options || typeof options.idempotencyKey !== "string" || !options.idempotencyKey.trim()
    || options.idempotencyKey.length > 160) {
    throw new Error("Invalid learning job identity.");
  }
  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length > MAX_PAYLOAD_LENGTH) throw new Error("Learning job payload is too large.");
  const priority = options.priority ?? 0;
  const maxAttempts = options.maxAttempts ?? 5;
  if (!Number.isInteger(priority) || priority < -100 || priority > 100
    || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new Error("Invalid learning job priority or retry limit.");
  }

  ensurePersistenceSchema();
  const database = getDatabase();
  const id = randomUUID();
  const availableAt = options.availableAt ?? nowIso();
  database.prepare(`
    INSERT OR IGNORE INTO learning_jobs (
      id, owner_id, job_type, payload_json, priority, max_attempts,
      available_at, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerId, jobType, payloadJson, priority, maxAttempts, availableAt, options.idempotencyKey, nowIso(), nowIso());

  const row = database.prepare(`
    SELECT id, owner_id, job_type, payload_json, status, priority, attempts, max_attempts,
      available_at, lease_expires_at, claimed_by, last_error_code, created_at
    FROM learning_jobs WHERE owner_id = ? AND job_type = ? AND idempotency_key = ?
  `).get(ownerId, jobType, options.idempotencyKey) as JobRow | undefined;
  if (!row) throw new Error("Learning job could not be loaded after enqueue.");
  return mapJob(row);
}

function finishExpiredLeases(now: string): void {
  const database = getDatabase();
  const expired = database.prepare(`
    SELECT id, attempts, max_attempts FROM learning_jobs
    WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
  `).all(now) as Array<{ id: string; attempts: number; max_attempts: number }>;

  for (const job of expired) {
    const terminal = job.attempts >= job.max_attempts;
    const status = terminal ? "failed" : "queued";
    const errorCode = terminal ? "lease_expired_max_attempts" : "lease_expired";
    database.prepare(`
      UPDATE learning_jobs SET status = ?, available_at = ?, lease_expires_at = NULL, claimed_by = NULL,
        last_error_code = ?, finished_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
        updated_at = ? WHERE id = ? AND status = 'running'
    `).run(status, now, errorCode, status, now, now, job.id);
    database.prepare(`
      UPDATE learning_job_attempts SET status = ?, error_code = ?, finished_at = ?
      WHERE job_id = ? AND attempt_number = ? AND status = 'running'
    `).run(terminal ? "failed" : "retrying", errorCode, now, job.id, job.attempts);
  }
}

export function claimNextLearningJob(workerId: string, now = new Date(), leaseMs = LEASE_MS): LearningJob | null {
  if (typeof workerId !== "string" || !workerId.trim() || workerId.length > 120
    || !Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 10 * 60_000) {
    throw new Error("Invalid worker identity or lease duration.");
  }
  ensurePersistenceSchema();
  const database = getDatabase();
  const nowText = now.toISOString();
  finishExpiredLeases(nowText);
  const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();

  const claim = database.transaction(() => {
    const row = database.prepare(`
      SELECT id, owner_id, job_type, payload_json, status, priority, attempts, max_attempts,
        available_at, lease_expires_at, claimed_by, last_error_code, created_at
      FROM learning_jobs
      WHERE status = 'queued' AND available_at <= ?
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get(nowText) as JobRow | undefined;
    if (!row) return null;

    const nextAttempt = row.attempts + 1;
    const updated = database.prepare(`
      UPDATE learning_jobs SET status = 'running', attempts = ?, claimed_by = ?,
        lease_expires_at = ?, started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE id = ? AND status = 'queued'
    `).run(nextAttempt, workerId, leaseExpiresAt, nowText, nowText, row.id);
    if (updated.changes !== 1) return null;

    database.prepare(`
      INSERT INTO learning_job_attempts (id, job_id, attempt_number, worker_id, status, started_at)
      VALUES (?, ?, ?, ?, 'running', ?)
    `).run(randomUUID(), row.id, nextAttempt, workerId, nowText);

    const claimed = database.prepare(`
      SELECT id, owner_id, job_type, payload_json, status, priority, attempts, max_attempts,
        available_at, lease_expires_at, claimed_by, last_error_code, created_at
      FROM learning_jobs WHERE id = ?
    `).get(row.id) as JobRow;
    return mapJob(claimed);
  });
  return claim.immediate();
}

export function completeLearningJob(
  jobId: string,
  workerId: string,
  result: Record<string, unknown> = {},
  now = new Date(),
): boolean {
  const database = getDatabase();
  const nowText = now.toISOString();
  const resultJson = JSON.stringify(result);
  if (resultJson.length > MAX_PAYLOAD_LENGTH) throw new Error("Learning job result is too large.");

  const complete = database.transaction(() => {
    const row = database.prepare(`
      SELECT attempts FROM learning_jobs WHERE id = ? AND status = 'running' AND claimed_by = ?
    `).get(jobId, workerId) as { attempts: number } | undefined;
    if (!row) return false;
    const update = database.prepare(`
      UPDATE learning_jobs SET status = 'completed', result_json = ?, finished_at = ?,
        lease_expires_at = NULL, claimed_by = NULL, last_error_code = NULL, updated_at = ?
      WHERE id = ? AND status = 'running' AND claimed_by = ?
    `).run(resultJson, nowText, nowText, jobId, workerId);
    if (update.changes !== 1) return false;
    database.prepare(`
      UPDATE learning_job_attempts SET status = 'completed', result_json = ?, finished_at = ?
      WHERE job_id = ? AND attempt_number = ? AND worker_id = ? AND status = 'running'
    `).run(resultJson, nowText, jobId, row.attempts, workerId);
    return true;
  });
  return complete.immediate();
}

export function failLearningJob(
  jobId: string,
  workerId: string,
  errorCode: string,
  retryable: boolean,
  now = new Date(),
): LearningJobStatus | null {
  const database = getDatabase();
  const nowText = now.toISOString();
  const fail = database.transaction(() => {
    const row = database.prepare(`
      SELECT attempts, max_attempts FROM learning_jobs
      WHERE id = ? AND status = 'running' AND claimed_by = ?
    `).get(jobId, workerId) as { attempts: number; max_attempts: number } | undefined;
    if (!row) return null;
    const shouldRetry = retryable && row.attempts < row.max_attempts;
    const status: LearningJobStatus = shouldRetry ? "queued" : "failed";
    const backoffMs = Math.min(1_000 * (2 ** Math.max(0, row.attempts - 1)), MAX_BACKOFF_MS);
    const availableAt = shouldRetry ? new Date(now.getTime() + backoffMs).toISOString() : nowText;
    const safeCode = /^[a-z0-9_-]{1,80}$/i.test(errorCode) ? errorCode : "job_failed";
    database.prepare(`
      UPDATE learning_jobs SET status = ?, available_at = ?, lease_expires_at = NULL, claimed_by = NULL,
        last_error_code = ?, finished_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END, updated_at = ?
      WHERE id = ? AND status = 'running' AND claimed_by = ?
    `).run(status, availableAt, safeCode, status, nowText, nowText, jobId, workerId);
    database.prepare(`
      UPDATE learning_job_attempts SET status = ?, error_code = ?, finished_at = ?
      WHERE job_id = ? AND attempt_number = ? AND worker_id = ? AND status = 'running'
    `).run(shouldRetry ? "retrying" : "failed", safeCode, nowText, jobId, row.attempts, workerId);
    return status;
  });
  return fail.immediate();
}

export function getLearningJobStats(): Record<LearningJobStatus, number> & { expiredLeases: number } {
  ensurePersistenceSchema();
  const database = getDatabase();
  const rows = database.prepare("SELECT status, COUNT(*) AS count FROM learning_jobs GROUP BY status")
    .all() as Array<{ status: LearningJobStatus; count: number }>;
  const stats: Record<LearningJobStatus, number> & { expiredLeases: number } = {
    queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0, expiredLeases: 0,
  };
  for (const row of rows) stats[row.status] = row.count;
  stats.expiredLeases = (database.prepare(`
    SELECT COUNT(*) AS count FROM learning_jobs
    WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
  `).get(nowIso()) as { count: number }).count;
  return stats;
}

export function enqueueDailyPlansForEligibleLearners(): { eligible: number; enqueued: number; skipped: number } {
  ensurePersistenceSchema();
  const database = getDatabase();
  const profiles = database.prepare(`
    SELECT owner_id, timezone, daily_target_minutes, goals_json
    FROM learner_profiles WHERE schedule_enabled = 1
  `).all() as ScheduledProfile[];
  let enqueued = 0;
  let skipped = 0;

  for (const profile of profiles) {
    const localDate = localDateForZone(profile.timezone);
    const existingPlan = database.prepare(`
      SELECT id FROM learning_plans WHERE owner_id = ? AND local_date = ?
        AND generation_source = 'scheduled' AND status IN ('published', 'completed')
      LIMIT 1
    `).get(profile.owner_id, localDate);
    if (existingPlan) {
      skipped += 1;
      continue;
    }

    let goals: string[] = [];
    try {
      const parsed: unknown = JSON.parse(profile.goals_json);
      if (Array.isArray(parsed)) goals = parsed.filter((goal): goal is string => typeof goal === "string" && !!goal.trim()).slice(0, 10);
    } catch { /* A malformed saved goal falls back to a safe default. */ }

    const job = enqueueLearningJob(profile.owner_id, "generate_daily_plan", {
      localDate,
      dailyTargetMinutes: profile.daily_target_minutes,
      goal: goals[0] ?? "Improve everyday English communication",
    }, { idempotencyKey: `daily-plan:${localDate}`, priority: 10, maxAttempts: 4 });
    if (job.status === "queued" || job.status === "running" || job.status === "completed") enqueued += 1;
  }
  return { eligible: profiles.length, enqueued, skipped };
}

export async function processLearningJobs(limit = 5, workerId = `worker-${randomUUID()}`): Promise<{
  workerId: string;
  processed: number;
  completed: number;
  retried: number;
  failed: number;
}> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("Worker limit must be between 1 and 10.");
  let processed = 0;
  let completed = 0;
  let retried = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = claimNextLearningJob(workerId);
    if (!job) break;
    processed += 1;
    try {
      if (job.jobType !== "generate_daily_plan") {
        throw new AdaptiveLearningError("invalid_input", "Unsupported learning job type.");
      }
      const target = job.payload.dailyTargetMinutes;
      const goal = job.payload.goal;
      const localDate = job.payload.localDate;
      if (typeof target !== "number" || typeof goal !== "string" || typeof localDate !== "string") {
        throw new AdaptiveLearningError("invalid_input", "Scheduled plan job payload is invalid.");
      }
      const plan = await generateDailyLearningPlan(job.ownerId, {
        dailyTargetMinutes: target,
        goal,
        localDate,
        generationSource: "scheduled",
      });
      if (completeLearningJob(job.id, workerId, { planId: plan.id, localDate: plan.localDate, version: plan.version })) completed += 1;
    } catch (error) {
      const errorCode = error instanceof ModelProviderError ? error.code
        : error instanceof AdaptiveLearningError ? error.code : "job_failed";
      const retryable = error instanceof ModelProviderError
        ? error.code === "timeout" || error.code === "provider_unavailable"
        : !(error instanceof AdaptiveLearningError);
      const status = failLearningJob(job.id, workerId, errorCode, retryable);
      if (status === "queued") retried += 1;
      else if (status === "failed") failed += 1;
    }
  }
  return { workerId, processed, completed, retried, failed };
}
