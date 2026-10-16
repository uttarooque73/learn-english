import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant"; content: string };
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4_000;

function validMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (message.role === "user" || message.role === "assistant")
    && typeof message.content === "string"
    && message.content.trim().length > 0
    && message.content.length <= MAX_MESSAGE_LENGTH;
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
  if (typeof body.scenario !== "string" || body.scenario.trim().length < 1 || body.scenario.length > 100
    || !Array.isArray(body.messages) || body.messages.length < 2 || body.messages.length > MAX_MESSAGES
    || !body.messages.every(validMessage) || !body.messages.some((message) => message.role === "user")
    || !body.messages.some((message) => message.role === "assistant")) {
    return NextResponse.json({ error: "Provide a scenario and a conversation with 2–40 valid messages." }, { status: 400 });
  }
  const difficulty = body.difficulty === "Intermediate" || body.difficulty === "Advanced" ? body.difficulty : "Beginner";
  const transcript = (body.messages as Message[]).map((message) => `${message.role === "user" ? "Learner" : "Tutor"}: ${message.content}`).join("\n");

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
            content: "You are a supportive English tutor. Summarize only evidence present in the transcript; never invent learner errors, vocabulary, or achievements. Return valid JSON with this exact shape: {\"topicSummary\":string,\"keyPoints\":string[],\"corrections\":[{\"original\":string,\"improved\":string,\"reason\":string}],\"vocabulary\":[{\"phrase\":string,\"meaning\":string}],\"strengths\":string[],\"improvements\":string[],\"followUpExercise\":string}. Keep lists concise: up to 4 key points, 3 corrections, 4 vocabulary items, 3 strengths, and 3 improvements. If no clear corrections or vocabulary appear, return empty arrays. Do not assign proficiency scores or CEFR levels. The learner's level is " + difficulty + ".",
          },
          { role: "user", content: `Scenario: ${body.scenario}\nConversation transcript:\n${transcript}` },
        ],
      }),
    });
    if (!response.ok) {
      let detail = "";
      try { detail = ((await response.json()) as { error?: string }).error ?? ""; } catch { /* Ignore non-JSON errors. */ }
      return NextResponse.json({ error: detail || "Ollama could not generate the session summary." }, { status: 502 });
    }
    const result = await response.json() as { message?: { content?: string } };
    const content = result.message?.content;
    if (!content) return NextResponse.json({ error: "Ollama returned an empty session summary." }, { status: 502 });
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      const json = content.match(/\{[\s\S]*\}/)?.[0];
      if (!json) return NextResponse.json({ error: "The AI returned a summary in an unexpected format. Please retry." }, { status: 502 });
      try { parsed = JSON.parse(json) as Record<string, unknown>; }
      catch { return NextResponse.json({ error: "The AI returned a summary in an unexpected format. Please retry." }, { status: 502 }); }
    }
    const strings = (value: unknown, limit: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit) : [];
    const objects = <T extends Record<string, string>>(value: unknown, keys: (keyof T)[], limit: number): T[] => Array.isArray(value)
      ? value.filter((item): item is T => !!item && typeof item === "object" && keys.every((key) => typeof (item as Record<string, unknown>)[key as string] === "string")).slice(0, limit)
      : [];
    return NextResponse.json({
      topicSummary: typeof parsed.topicSummary === "string" ? parsed.topicSummary : "You practised a conversation on " + body.scenario + ".",
      keyPoints: strings(parsed.keyPoints, 4),
      corrections: objects(parsed.corrections, ["original", "improved", "reason"], 3),
      vocabulary: objects(parsed.vocabulary, ["phrase", "meaning"], 4),
      strengths: strings(parsed.strengths, 3),
      improvements: strings(parsed.improvements, 3),
      followUpExercise: typeof parsed.followUpExercise === "string" ? parsed.followUpExercise : "Repeat one answer from this conversation, making it clearer and more specific.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: timedOut ? "Session summary took too long. Please retry." : "Cannot connect to Ollama. Check that Ollama is running." },
      { status: timedOut ? 504 : 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
