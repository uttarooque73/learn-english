import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FeedbackIssue = {
  original: string;
  corrected: string;
  category: "grammar" | "naturalness";
  importance: "important" | "optional";
  explanation: string;
};

type Feedback = {
  originalSentence: string;
  correctedSentence: string;
  explanation: string;
  issues: FeedbackIssue[];
  practicePrompt: string;
  tips: string[];
  pronunciationTip: string;
  vocabulary: { phrase: string; meaning: string; example: string }[];
};

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 4_000;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }
  const body = payload as Record<string, unknown>;
  if (!isText(body.learnerMessage) || !isText(body.assistantMessage)) {
    return NextResponse.json({ error: "Provide both the learner message and the AI reply (up to 4,000 characters each)." }, { status: 400 });
  }

  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [
          {
            role: "system",
            content: "You are a supportive English tutor. Return only valid JSON with this exact shape: {\"originalSentence\":string,\"correctedSentence\":string,\"explanation\":string,\"issues\":[{\"original\":string,\"corrected\":string,\"category\":\"grammar\"|\"naturalness\",\"importance\":\"important\"|\"optional\",\"explanation\":string}],\"practicePrompt\":string,\"tips\":string[],\"pronunciationTip\":string,\"vocabulary\":[{\"phrase\":string,\"meaning\":string,\"example\":string}]}. Preserve the learner's intended meaning. Identify important grammar/meaning errors separately from optional naturalness/style improvements. Give 0-4 specific issues with simple explanations, a short practice prompt based on the most useful correction, 1-3 concise tips, one general pronunciation practice tip, and at most 3 useful vocabulary phrases drawn from the AI reply. If the sentence is already natural, say so and do not invent errors. Never claim to measure actual pronunciation quality.",
          },
          {
            role: "user",
            content: `Learner message: ${body.learnerMessage}\nAI conversation reply: ${body.assistantMessage}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      let detail = "";
      try { detail = ((await response.json()) as { error?: string }).error ?? ""; } catch { /* Ignore non-JSON errors. */ }
      return NextResponse.json({ error: detail || "Ollama could not generate English feedback." }, { status: 502 });
    }

    const result = (await response.json()) as { message?: { content?: string }; error?: string };
    const content = result.message?.content;
    if (!content) return NextResponse.json({ error: "Ollama returned empty feedback." }, { status: 502 });

    let parsed: Partial<Feedback>;
    try {
      parsed = JSON.parse(content) as Partial<Feedback>;
    } catch {
      const json = content.match(/\{[\s\S]*\}/)?.[0];
      if (!json) return NextResponse.json({ error: "The AI returned feedback in an unexpected format. Please retry." }, { status: 502 });
      try { parsed = JSON.parse(json) as Partial<Feedback>; }
      catch { return NextResponse.json({ error: "The AI returned feedback in an unexpected format. Please retry." }, { status: 502 }); }
    }

    const validIssues = Array.isArray(parsed.issues) ? parsed.issues.filter((item): item is FeedbackIssue =>
      !!item && typeof item.original === "string" && typeof item.corrected === "string" &&
      (item.category === "grammar" || item.category === "naturalness") &&
      (item.importance === "important" || item.importance === "optional") &&
      typeof item.explanation === "string"
    ).slice(0, 4) : [];
    const feedback: Feedback = {
      originalSentence: body.learnerMessage,
      correctedSentence: typeof parsed.correctedSentence === "string" ? parsed.correctedSentence : body.learnerMessage,
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "Review the corrected sentence and try saying it aloud.",
      issues: validIssues,
      practicePrompt: typeof parsed.practicePrompt === "string" && parsed.practicePrompt.trim()
        ? parsed.practicePrompt.slice(0, 500)
        : "Say the corrected sentence in your own words.",
      tips: Array.isArray(parsed.tips) ? parsed.tips.filter((tip): tip is string => typeof tip === "string").slice(0, 3) : [],
      pronunciationTip: typeof parsed.pronunciationTip === "string" ? parsed.pronunciationTip : "Speak slowly and clearly, then repeat the sentence naturally.",
      vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary.filter((item): item is Feedback["vocabulary"][number] =>
        !!item && typeof item.phrase === "string" && typeof item.meaning === "string" && typeof item.example === "string"
      ).slice(0, 3) : [],
    };
    return NextResponse.json(feedback, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: timedOut ? "English feedback took too long. Please retry." : "Cannot connect to Ollama. Check that Ollama is running." },
      { status: timedOut ? 504 : 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
