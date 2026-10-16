import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_EXPECTED_TEXT_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 90_000;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send an audio recording and the target sentence as multipart form data." }, { status: 400 });
  }

  const audio = form.get("audio");
  const expectedText = form.get("expectedText");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Record a short audio clip before requesting phoneme-level feedback." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "The recording is too large. Keep pronunciation clips under 12 MB." }, { status: 413 });
  }
  if (audio.type && !audio.type.startsWith("audio/")) {
    return NextResponse.json({ error: "The recording must be an audio file." }, { status: 415 });
  }
  if (typeof expectedText !== "string" || !expectedText.trim() || expectedText.length > MAX_EXPECTED_TEXT_LENGTH) {
    return NextResponse.json({ error: "Provide the target sentence (up to 500 characters)." }, { status: 400 });
  }

  const baseUrl = (process.env.PRONUNCIATION_SERVICE_URL || "http://127.0.0.1:8001").replace(/\/+$/, "");
  const serviceForm = new FormData();
  serviceForm.append("file", audio, audio.name || "pronunciation.webm");
  serviceForm.append("expected_text", expectedText.trim());
  serviceForm.append("lang", "en");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl + "/pronunciation", { method: "POST", body: serviceForm, signal: controller.signal });
    if (!response.ok) {
      return NextResponse.json({ error: "The local pronunciation service could not analyze this recording. Check that OpenPronounce is running and try again." }, { status: 502 });
    }
    const raw: unknown = await response.json();
    if (!isRecord(raw)) return NextResponse.json({ error: "The pronunciation service returned an unexpected response." }, { status: 502 });
    const score = finiteNumber(raw.score);
    if (score === null) return NextResponse.json({ error: "The pronunciation service did not return a valid score." }, { status: 502 });
    const differences = isRecord(raw.differences) ? raw.differences : {};
    const rawErrors = Array.isArray(differences.errors) ? differences.errors : [];
    const errors = rawErrors.filter(isRecord).slice(0, 30).map((item) => {
      const phones = Array.isArray(item.phones) ? item.phones.filter(isRecord).slice(0, 20).map((phone) => ({
        expected: typeof phone.expected === "string" ? phone.expected.slice(0, 40) : "",
        heard: typeof phone.actual === "string" ? phone.actual.slice(0, 40) : typeof phone.heard === "string" ? phone.heard.slice(0, 40) : null,
        confidence: Math.max(0, Math.min(1, finiteNumber(phone.confidence) ?? 0)),
      })) : [];
      return {
        word: typeof item.word === "string" ? item.word.slice(0, 80) : "Unknown word",
        expected: typeof item.expected === "string" ? item.expected.slice(0, 160) : "",
        actual: typeof item.actual === "string" ? item.actual.slice(0, 160) : null,
        confidence: Math.max(0, Math.min(1, finiteNumber(item.confidence) ?? 0)),
        phones,
      };
    });
    return NextResponse.json({
      score: Math.round(Math.max(0, Math.min(100, score))),
      transcript: typeof raw.transcribe === "string" ? raw.transcribe.slice(0, 1000) : typeof raw.transcript === "string" ? raw.transcript.slice(0, 1000) : "",
      phonemeErrorRate: finiteNumber(differences.phoneme_error_rate),
      wordErrorRate: finiteNumber(differences.word_error_rate),
      errors,
    });
  } catch {
    return NextResponse.json({
      error: "The local phoneme-assessment service is unavailable. Start the OpenPronounce companion service on 127.0.0.1:8001, or continue with transcript-based practice.",
    }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
