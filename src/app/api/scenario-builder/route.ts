import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DESCRIPTION_LENGTH = 1200;
const REQUEST_TIMEOUT_MS = 60000;

type GeneratedScenario = {
  title: string;
  description: string;
  learnerRole: string;
  aiRole: string;
  stakes: string;
  systemPrompt: string;
  starterMessage: string;
};

function clean(value: unknown, max = 1200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const description = body && typeof body === "object"
    ? clean((body as Record<string, unknown>).description, MAX_DESCRIPTION_LENGTH)
    : "";
  if (description.length < 8) {
    return NextResponse.json({ error: "Describe the situation in at least a few words." }, { status: 400 });
  }

  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
            content: "Create a practical English-learning role-play from the learner's situation. The situation may be written in any language; understand it and write the practice materials in clear, natural English. Return ONLY valid JSON with exactly these string fields: title (short, max 60 chars), description (one sentence), learnerRole (who the learner is), aiRole (who you play), stakes (what the learner needs to achieve), systemPrompt (detailed instructions for an interactive role-play; stay in character, one turn at a time, realistic but supportive, never lecture, adapt to beginner English), starterMessage (the first natural line spoken by the AI role, inviting the learner to respond). Do not invent sensitive facts. Keep the scene safe and appropriate for language practice."
          },
          { role: "user", content: "Situation to rehearse:\n" + description }
        ],
        options: { temperature: 0.35 }
      })
    });
    if (!response.ok) {
      let detail = "";
      try { detail = ((await response.json()) as { error?: string }).error || ""; } catch {}
      return NextResponse.json({ error: detail || "Ollama could not generate this scenario." }, { status: 502 });
    }
    const result = await response.json() as { message?: { content?: string }; error?: string };
    const raw = result.message?.content;
    if (!raw) return NextResponse.json({ error: "Ollama returned an empty scenario. Please try again." }, { status: 502 });

    let parsed: Partial<GeneratedScenario>;
    try {
      parsed = JSON.parse(raw) as Partial<GeneratedScenario>;
    } catch {
      return NextResponse.json({ error: "Ollama returned an invalid scenario. Try a more specific description." }, { status: 502 });
    }

    const scenario: GeneratedScenario = {
      title: clean(parsed.title, 60) || "My real-world scenario",
      description: clean(parsed.description, 240) || description,
      learnerRole: clean(parsed.learnerRole, 160) || "The person preparing for this situation",
      aiRole: clean(parsed.aiRole, 160) || "A person involved in the situation",
      stakes: clean(parsed.stakes, 300) || "Communicate clearly and reach a practical next step",
      systemPrompt: clean(parsed.systemPrompt, 3000),
      starterMessage: clean(parsed.starterMessage, 600)
    };
    if (!scenario.systemPrompt || !scenario.starterMessage) {
      return NextResponse.json({ error: "The generated scenario was incomplete. Please generate it again." }, { status: 502 });
    }
    return NextResponse.json({ scenario });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({
      error: timedOut
        ? "Scenario generation took too long. Please try again."
        : "Cannot connect to Ollama. Check that Ollama is running and the configured model is available."
    }, { status: timedOut ? 504 : 503 });
  } finally {
    clearTimeout(timeout);
  }
}
