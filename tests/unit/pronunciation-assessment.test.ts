import { describe, expect, it } from "vitest";
import { assessTranscript } from "@/lib/pronunciation-assessment";

describe("assessTranscript", () => {
  it("returns 100 for a matching transcript regardless of case or punctuation", () => {
    expect(assessTranscript("Hello, world!", "hello world").score).toBe(100);
  });

  it("reports missing words and lowers the sequence match score", () => {
    const result = assessTranscript("I would like some water", "I like water");
    expect(result.score).toBeLessThan(100);
    expect(result.missingWords).toContain("would");
    expect(result.missingWords).toContain("some");
  });

  it("reports extra words and accounts for word order", () => {
    const result = assessTranscript("I really like this", "I really, really like this today");
    expect(result.extraWords).toContain("really");
    expect(result.extraWords).toContain("today");
    expect(result.score).toBeLessThan(100);
  });

  it("returns zero when neither transcript contains recognizable words", () => {
    expect(assessTranscript("123 !", "...").score).toBe(0);
  });
});
