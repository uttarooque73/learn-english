import { afterEach, describe, expect, it } from "vitest";
import { getDueVocabulary, getVocabulary, reviewVocabulary, saveVocabulary } from "@/lib/learning-storage";
import { resetPersistenceCacheForTests } from "@/lib/client-persistence";

afterEach(() => resetPersistenceCacheForTests());

describe("spaced-repetition vocabulary review", () => {
  it("schedules a saved phrase after a review and tracks review history", () => {
    const saved = saveVocabulary({ phrase: "hands-on experience", meaning: "Practical experience", example: "I have hands-on experience." });
    const reviewedAt = new Date("2026-10-16T12:00:00.000Z");

    const reviewed = reviewVocabulary(saved.id, "good", reviewedAt);

    expect(reviewed?.reviewCount).toBe(1);
    expect(reviewed?.lastReviewedAt).toBe(reviewedAt.toISOString());
    expect(reviewed?.nextReviewAt).toBe("2026-10-19T12:00:00.000Z");
    expect(reviewed?.status).toBe("familiar");
    expect(getDueVocabulary(new Date("2026-10-18T12:00:00.000Z"))).toHaveLength(0);
    expect(getDueVocabulary(new Date("2026-10-19T12:00:00.000Z"))).toHaveLength(1);
  });

  it("uses shorter intervals when a phrase needs more practice and longer intervals when easy", () => {
    const saved = saveVocabulary({ phrase: "to clarify", meaning: "To make clear", example: "Let me clarify the plan." });
    const start = new Date("2026-10-16T12:00:00.000Z");

    const again = reviewVocabulary(saved.id, "again", start);
    expect(again?.nextReviewAt).toBe("2026-10-17T12:00:00.000Z");
    const easy = reviewVocabulary(saved.id, "easy", start);
    expect(easy?.nextReviewAt).toBe("2026-10-23T12:00:00.000Z");
    expect(easy?.reviewCount).toBe(2);
    expect(easy?.status).toBe("mastered");
  });

  it("keeps older saved vocabulary due immediately and ignores unknown ids", () => {
    saveVocabulary({ phrase: "follow up", meaning: "Continue later", example: "I will follow up tomorrow." });
    expect(getDueVocabulary()).toEqual(getVocabulary());
    expect(reviewVocabulary("missing-id", "good")).toBeUndefined();
  });
});
