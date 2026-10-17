import { getLearningPreferences } from "@/lib/learning-preferences";

/** Speak text using the voice and speed saved in Learning preferences. */
export function speakText(text: string, onEnd?: () => void, rateOverride?: number): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) return false;

  const preferences = getLearningPreferences();
  const synthesis = window.speechSynthesis;
  synthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const voices = synthesis.getVoices();
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

  utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = rateOverride ?? preferences.speechRate;
  // Pitch is a fallback cue when this device has no clearly named voice for the requested style.
  utterance.pitch = preferences.speechVoiceGender === "female" ? (genderMatchedVoice ? 1.05 : 1.2) : preferences.speechVoiceGender === "male" ? (genderMatchedVoice ? 0.95 : 0.82) : 1.05;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  synthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
