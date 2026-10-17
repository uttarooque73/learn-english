export type ModelErrorCode =
  | "invalid_request"
  | "provider_unavailable"
  | "timeout"
  | "invalid_output";

export class ModelProviderError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ModelProviderError";
  }
}

export type JsonValidator<T> = (value: unknown) => value is T;

export interface ModelProvider {
  readonly modelName: string;
  generateText(prompt: string, timeoutMs?: number): Promise<string>;
  generateJson<T>(
    prompt: string,
    validate: JsonValidator<T>,
    timeoutMs?: number,
  ): Promise<T>;
}

type OllamaResponse = {
  response?: unknown;
  error?: unknown;
};

type OllamaProviderOptions = {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const MAX_PROMPT_LENGTH = 16_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export function createOllamaProvider(options: OllamaProviderOptions = {}): ModelProvider {
  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434")
    .replace(/\/+$/, "");
  const modelName = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(prompt: string, format?: "json", timeoutMs = defaultTimeoutMs): Promise<string> {
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) {
      throw new ModelProviderError("invalid_request", "Prompt must contain 1–16000 characters.");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
      throw new ModelProviderError("invalid_request", "Timeout must be between 1 and 120000 milliseconds.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, prompt, stream: false, ...(format ? { format } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ModelProviderError(
          "provider_unavailable",
          `The local model provider returned HTTP ${response.status}.`,
        );
      }

      const payload = await response.json() as OllamaResponse;
      if (payload.error) {
        throw new ModelProviderError("provider_unavailable", "The local model provider rejected the request.");
      }
      if (typeof payload.response !== "string" || !payload.response.trim()) {
        throw new ModelProviderError("invalid_output", "The model provider returned an empty response.");
      }
      return payload.response.trim();
    } catch (error) {
      if (error instanceof ModelProviderError) throw error;
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new ModelProviderError("timeout", "The local model request exceeded its time limit.", { cause: error });
      }
      throw new ModelProviderError("provider_unavailable", "The local model provider is unavailable.", { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    modelName,
    generateText: (prompt, timeoutMs) => request(prompt, undefined, timeoutMs),
    async generateJson<T>(prompt: string, validate: JsonValidator<T>, timeoutMs?: number): Promise<T> {
      const text = await request(
        `${prompt}\n\nReturn only one valid JSON value. Do not include Markdown fences or commentary.`,
        "json",
        timeoutMs,
      );
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch (error) {
        throw new ModelProviderError("invalid_output", "The model response was not valid JSON.", { cause: error });
      }
      if (!validate(value)) {
        throw new ModelProviderError("invalid_output", "The model response did not match the required output schema.");
      }
      return value;
    },
  };
}
