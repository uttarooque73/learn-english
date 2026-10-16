import { getLearningPreferences } from "@/lib/learning-preferences";

/** Speak text using the voice and speed saved in Learning preferences. */
export function speakText(text: string, onEnd?: () => void): boolean {
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
  const voice = savedVoice
    ?? englishVoices.find((candidate) => candidate.lang.toLowerCase() === "en-us")
    ?? englishVoices[0]
    ?? null;

  utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = preferences.speechRate;
  utterance.pitch = 1.05;
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
