import { NextRequest, NextResponse } from "next/server";
import { authorizeLearningWorker } from "@/lib/learning-worker-auth";
import { getLearningOperationsSnapshot } from "@/lib/learning-operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authorization = authorizeLearningWorker(request);
  if (authorization === "misconfigured") {
    return NextResponse.json({ error: "Learning worker secret is not configured securely." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
  if (authorization !== "authorized") {
    return NextResponse.json({ error: "Unauthorized operations request." }, {
      status: 401, headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    return NextResponse.json({ operations: getLearningOperationsSnapshot() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Learning operations metrics are unavailable." }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
}
