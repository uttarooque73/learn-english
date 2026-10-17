import { beforeEach, describe, expect, it } from "vitest";
import { getVocabulary, removeVocabulary, saveVocabulary, updateVocabularyStatus } from "@/lib/learning-storage";
import { resetPersistenceCacheForTests } from "@/lib/client-persistence";

describe("vocabulary learning status", () => {
  beforeEach(() => resetPersistenceCacheForTests());

  it("saves new vocabulary as learning and preserves existing phrase deduplication", () => {
    const first = saveVocabulary({ phrase: "on the same page", meaning: "in agreement", example: "We need to get on the same page." });
    expect(first.status).toBe("learning");
    const duplicate = saveVocabulary({ phrase: " ON THE SAME PAGE ", meaning: "different meaning", example: "Another example." });
    expect(duplicate.id).toBe(first.id);
    expect(getVocabulary()).toHaveLength(1);
  });

  it("updates status and persists it in the client database cache", () => {
    const word = saveVocabulary({ phrase: "follow up", meaning: "take further action", example: "I will follow up tomorrow." });
    updateVocabularyStatus(word.id, "mastered");
    expect(getVocabulary()[0].status).toBe("mastered");
  });

  it("removes a vocabulary item by id", () => {
    const word = saveVocabulary({ phrase: "circle back", meaning: "return to a topic", example: "Let's circle back later." });
    removeVocabulary(word.id);
    expect(getVocabulary()).toEqual([]);
  });
});
