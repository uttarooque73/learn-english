import { getLearningPreferences } from "@/lib/learning-preferences";

let playbackGeneration = 0;

/** Speak text using the voice and speed saved in Learning preferences. */
export function speakText(text: string, onEnd?: () => void, rateOverride?: number, onStart?: () => void, onError?: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) return false;

  const synthesis = window.speechSynthesis;
  const generation = ++playbackGeneration;
  synthesis.cancel();

  // Some browsers (notably Chrome) return an empty voice list on the first
  // getVoices() call. Wait briefly for voiceschanged so a saved voice URI is
  // resolved before speaking, rather than silently using the browser default.
  const speakWhenReady = () => {
    if (generation !== playbackGeneration) return;
    const voices = synthesis.getVoices();
    if (voices.length === 0) return;

    const preferences = getLearningPreferences();
    const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    const savedVoice = preferences.speechVoiceURI
      ? voices.find((voice) => voice.voiceURI === preferences.speechVoiceURI)
      : undefined;
    const preferredVoicePattern = preferences.speechVoiceGender === "female"
      ? /\bfemale\b|samantha|victoria|karen|zira|jenny|aria|ava|susan|hazel|moira|tessa|fiona|allison/i
      : preferences.speechVoiceGender === "male"
        ? /\bmale\b|alex|daniel|david|mark|guy|james|fred|tom|oliver|george|thomas|aaron/i
        : null;
    const genderMatchedVoice = preferredVoicePattern
      ? englishVoices.find((candidate) => preferredVoicePattern.test(candidate.name))
      : undefined;
    // An explicitly selected voice takes precedence; gender is a fallback when no voice is saved.
    const voice = savedVoice
      ?? genderMatchedVoice
      ?? englishVoices.find((candidate) => candidate.lang.toLowerCase() === "en-us")
      ?? englishVoices[0]
      ?? null;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-US";
    utterance.rate = rateOverride ?? preferences.speechRate;
    // Pitch is only a fallback cue when no named voice matches the requested style.
    utterance.pitch = preferences.speechVoiceGender === "female" ? (genderMatchedVoice ? 1.05 : 1.2) : preferences.speechVoiceGender === "male" ? (genderMatchedVoice ? 0.95 : 0.82) : 1.05;
    if (onStart) utterance.onstart = onStart;
    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onError ?? onEnd;
    }
    synthesis.speak(utterance);
  };

  const initialVoices = synthesis.getVoices();
  if (initialVoices.length > 0) {
    speakWhenReady();
    return true;
  }

  let settled = false;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    synthesis.removeEventListener?.("voiceschanged", onVoicesChanged);
    window.clearTimeout(fallbackTimer);
  };
  const onVoicesChanged = () => {
    if (synthesis.getVoices().length === 0) return;
    cleanup();
    speakWhenReady();
  };
  const fallbackTimer = window.setTimeout(() => {
    cleanup();
    // Some engines never dispatch voiceschanged. Speak with the engine's
    // default voice in that case, but still honor the saved playback rate.
    if (generation !== playbackGeneration) return;
    const preferences = getLearningPreferences();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";
    utterance.rate = rateOverride ?? preferences.speechRate;
    utterance.pitch = preferences.speechVoiceGender === "female" ? 1.2 : preferences.speechVoiceGender === "male" ? 0.82 : 1.05;
    if (onStart) utterance.onstart = onStart;
    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onError ?? onEnd;
    }
    synthesis.speak(utterance);
  }, 1200);
  synthesis.addEventListener?.("voiceschanged", onVoicesChanged);
  return true;
}

export function stopSpeaking(): void {
  playbackGeneration += 1;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
