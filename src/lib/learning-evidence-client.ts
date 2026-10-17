"use client";

import { initializeDatabasePersistence, readPersistedValue, writePersistedValue } from "@/lib/client-persistence";

export type EvidenceSource = "conversation" | "shadowing" | "fluency" | "micro_lesson" | "vocabulary" | "listening";
export type EvidenceActivityType = "conversation" | "vocabulary" | "grammar" | "shadowing" | "listening" | "fluency";

export type LearningEvidencePayload = {
  source: EvidenceSource;
  activityType: EvidenceActivityType;
  activityRef?: string;
  skillKey?: string;
  responseText?: string;
  durationSeconds: number;
  idempotencyKey?: string;
  score?: number;
  confidence?: number;
  feedback?: string;
  strengths?: string[];
  corrections?: Array<{ original: string; improved: string; reason: string }>;
};

type PendingEvidence = LearningEvidencePayload & { idempotencyKey: string };
const PENDING_KEY = "speakup:pending-learning-evidence:v1";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `evidence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readQueue(): PendingEvidence[] {
  try {
    const parsed: unknown = JSON.parse(readPersistedValue(PENDING_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingEvidence => !!item && typeof item === "object"
      && typeof (item as PendingEvidence).idempotencyKey === "string");
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingEvidence[]): void {
  writePersistedValue(PENDING_KEY, JSON.stringify(queue.slice(-100)));
}

async function postEvidence(payload: PendingEvidence): Promise<void> {
  const response = await fetch("/api/learning/evidence", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Learning evidence is queued and will be retried later.");
}

export async function flushPendingLearningEvidence(): Promise<void> {
  if (typeof window === "undefined") return;
  await initializeDatabasePersistence();
  const queue = readQueue();
  if (!queue.length) return;
  const remaining: PendingEvidence[] = [];
  for (const item of queue) {
    try {
      await postEvidence(item);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
}

export async function submitLearningEvidence(payload: LearningEvidencePayload): Promise<void> {
  if (typeof window === "undefined") return;
  const entry: PendingEvidence = { ...payload, idempotencyKey: payload.idempotencyKey ?? newIdempotencyKey() };
  try {
    await initializeDatabasePersistence();
  } catch {
    // Keep the event queued even if initial hydration is temporarily unavailable.
  }

  const queue = readQueue();
  if (!queue.some((item) => item.idempotencyKey === entry.idempotencyKey)) {
    queue.push(entry);
    writeQueue(queue);
  }

  try {
    await postEvidence(entry);
    writeQueue(readQueue().filter((item) => item.idempotencyKey !== entry.idempotencyKey));
  } catch (error) {
    // Keep the event in the database-backed queue for a later retry.
    throw error;
  }
}
