import { afterEach, describe, expect, it, vi } from "vitest";
import { getLearningPreferences } from "@/lib/learning-preferences";
import { speakText } from "@/lib/speech-playback";

vi.mock("@/lib/learning-preferences", () => ({ getLearningPreferences: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("speakText", () => {
  it("uses the explicitly saved voice even when a different gender preference is selected", () => {
    const femaleVoice = { name: "Samantha", lang: "en-US", voiceURI: "female-uri" } as SpeechSynthesisVoice;
    const selectedVoice = { name: "Custom English Voice", lang: "en-GB", voiceURI: "custom-uri" } as SpeechSynthesisVoice;
    vi.mocked(getLearningPreferences).mockReturnValue({
      speechVoiceURI: "custom-uri",
      speechVoiceGender: "female",
      speechRate: 1.2,
    } as ReturnType<typeof getLearningPreferences>);

    const utterances: Array<{ text: string; voice: SpeechSynthesisVoice | null; lang: string; rate: number; pitch: number }> = [];
    class MockUtterance {
      voice: SpeechSynthesisVoice | null = null;
      lang = "";
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) { utterances.push(this); }
    }
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn(() => [femaleVoice, selectedVoice]),
    });

    expect(speakText("Hello there")).toBe(true);
    expect(utterances[0].voice).toBe(selectedVoice);
    expect(utterances[0].rate).toBe(1.2);
    expect(utterances[0].lang).toBe("en-GB");
  });
});
