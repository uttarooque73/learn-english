import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const prompt = body && typeof body === "object" ? (body as Record<string, unknown>).prompt : undefined;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.trim().length > 1000) {
    return NextResponse.json({ error: "Enter a thought of 1–1000 characters." }, { status: 400 });
  }
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({
        model, stream: false, format: "json",
        messages: [
          { role: "system", content: "You are a concise English writing coach. The learner may enter broken English or another language. Infer the intended meaning without judging them. Return JSON only with an alternatives array containing exactly three distinct, natural English sentences: simple, conversational, and polished. Preserve the learner's intent, do not add facts, and keep the options short." },
          { role: "user", content: prompt.trim() },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ error: "AI service returned an unsuccessful response. Check that Ollama and the configured model are running." }, { status: 502 });
    const payload = await response.json() as { message?: { content?: string }; error?: string };
    const parsed = JSON.parse(payload.message?.content ?? "{}") as { alternatives?: unknown };
    const alternatives = Array.isArray(parsed.alternatives) ? parsed.alternatives.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()).slice(0, 3) : [];
    if (alternatives.length !== 3) return NextResponse.json({ error: "AI returned an incomplete response. Please try again." }, { status: 502 });
    return NextResponse.json({ alternatives });
  } catch (cause) {
    const timeoutError = cause instanceof Error && cause.name === "AbortError";
    return NextResponse.json({ error: timeoutError ? "AI request timed out. Please try again." : "Cannot connect to Ollama. Start Ollama and check OLLAMA_BASE_URL and OLLAMA_MODEL." }, { status: timeoutError ? 504 : 503 });
  } finally { clearTimeout(timeout); }
}
