import { NextRequest, NextResponse } from "next/server";
import { authorizeLearningWorker } from "@/lib/learning-worker-auth";
import { enqueueDailyPlansForEligibleLearners, getLearningJobStats } from "@/lib/learning-jobs";

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
  return NextResponse.json({ error: "Unauthorized scheduler request." }, {
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
    return NextResponse.json({ healthy: false, error: "Learning scheduler status is unavailable." }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const error = authError(request);
  if (error) return error;
  try {
    const result = enqueueDailyPlansForEligibleLearners();
    return NextResponse.json({ ...result, queue: getLearningJobStats() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Daily learning jobs could not be enqueued." }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
}
