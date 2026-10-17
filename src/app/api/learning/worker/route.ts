import { NextRequest, NextResponse } from "next/server";
import { authorizeLearningWorker } from "@/lib/learning-worker-auth";
import { getLearningJobStats, processLearningJobs } from "@/lib/learning-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authError(request: NextRequest): NextResponse | null {
  const authorization = authorizeLearningWorker(request);
  if (authorization === "authorized") return null;
  if (authorization === "misconfigured") {
    return NextResponse.json({ error: "Learning worker secret is not configured securely." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({ error: "Unauthorized worker request." }, {
    status: 401, headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const error = authError(request);
  if (error) return error;
  try {
    return NextResponse.json({ healthy: true, queue: getLearningJobStats() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ healthy: false, error: "Learning worker status is unavailable." }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const error = authError(request);
  if (error) return error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, {
      status: 400, headers: { "Cache-Control": "no-store" },
    });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required." }, {
      status: 400, headers: { "Cache-Control": "no-store" },
    });
  }

  const input = body as Record<string, unknown>;
  const limit = input.limit ?? 5;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10) {
    return NextResponse.json({ error: "limit must be an integer between 1 and 10." }, {
      status: 400, headers: { "Cache-Control": "no-store" },
    });
  }
  const workerId = request.headers.get("x-worker-id") || undefined;
  try {
    const result = await processLearningJobs(limit, workerId);
    return NextResponse.json({ ...result, queue: getLearningJobStats() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Learning worker could not process jobs." }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
}
