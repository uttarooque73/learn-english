import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

export type WorkerAuthorization = "authorized" | "misconfigured" | "unauthorized";

export function authorizeLearningWorker(request: NextRequest): WorkerAuthorization {
  const expected = process.env.LEARNING_WORKER_SECRET;
  if (!expected || expected.length < 24) return "misconfigured";

  const authorization = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return "unauthorized";
  const provided = authorization.slice(prefix.length);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (providedBuffer.length !== expectedBuffer.length) return "unauthorized";
  return timingSafeEqual(providedBuffer, expectedBuffer) ? "authorized" : "unauthorized";
}
