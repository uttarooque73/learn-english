import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4_000;
const REQUEST_TIMEOUT_MS = 120_000;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  if (
    !Array.isArray(payload.messages) ||
    payload.messages.length === 0 ||
    payload.messages.length > MAX_MESSAGES ||
    !payload.messages.every(isChatMessage)
  ) {
    return NextResponse.json(
      { error: `Provide between 1 and ${MAX_MESSAGES} valid conversation messages.` },
      { status: 400 },
    );
  }

  const messages = payload.messages as ChatMessage[];
  if (messages[messages.length - 1]?.role !== "user") {
    return NextResponse.json(
      { error: "The last conversation message must be from the user." },
      { status: 400 },
    );
  }

  const scenario =
    typeof payload.scenario === "string" ? payload.scenario.trim().slice(0, 120) : "Free conversation";
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen3:4b";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          {
            role: "system",
            content:
              "You are SpeakUp, a friendly English conversation coach. Keep the conversation natural and encouraging. " +
              "Use clear, everyday English suited to the learner. Ask one relevant follow-up question when helpful. " +
              "Do not interrupt the conversation with unsolicited detailed grammar lessons. If the learner asks for a correction, " +
              "show a natural corrected sentence and briefly explain it. The selected practice scenario is: " + scenario + ".",
          },
          ...messages,
        ],
      }),
    });
  } catch (error) {
    clearTimeout(timeout);
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "The AI took too long to respond. Please try again."
          : "Cannot connect to Ollama. Make sure Ollama is running and the configured model is available.",
      },
      { status: timedOut ? 504 : 503 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout);
    let detail = "";
    try {
      const result = (await upstream.json()) as { error?: string };
      detail = result.error || "";
    } catch {
      // Ollama may return a non-JSON error response.
    }
    return NextResponse.json(
      { error: detail || "Ollama returned an unsuccessful response." },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async start(output) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const chunk = JSON.parse(line) as {
              message?: { content?: string };
              error?: string;
              done?: boolean;
            };
            if (chunk.error) throw new Error(chunk.error);
            if (chunk.message?.content) output.enqueue(encoder.encode(chunk.message.content));
          }

          if (done) {
            if (buffer.trim()) {
              const chunk = JSON.parse(buffer) as { message?: { content?: string }; error?: string };
              if (chunk.error) throw new Error(chunk.error);
              if (chunk.message?.content) output.enqueue(encoder.encode(chunk.message.content));
            }
            break;
          }
        }
        output.close();
      } catch {
        output.error(new Error("The AI response stream ended unexpectedly."));
      } finally {
        clearTimeout(timeout);
        reader.releaseLock();
      }
    },
    async cancel() {
      clearTimeout(timeout);
      await reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
