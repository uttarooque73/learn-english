import { expect, test } from "./fixtures";

test("speaking feedback page restores saved reviews from persistence", async ({ page }) => {
  const saved = [{
    id: "review-1",
    transcript: "Yesterday I explained our new feature to my teammate.",
    prompt: "Explain a feature",
    proficiency: "Intermediate",
    createdAt: "2026-10-19T10:00:00.000Z",
    assessmentType: "transcript",
    metrics: { wordCount: 9, durationSeconds: 30, wordsPerMinute: 18 },
    feedback: {
      overallScore: 82,
      summary: "Your answer is clear and relevant.",
      categories: {
        fluency: { score: 80, feedback: "Your ideas flow naturally." },
        clarity: { score: 86, feedback: "Your main point is easy to follow." },
        grammar: { score: 78, feedback: "Check tense consistency." },
        vocabulary: { score: 81, feedback: "Your word choices fit the topic." },
        structure: { score: 84, feedback: "Your answer is organized." },
      },
      strengths: ["You answer the prompt directly."],
      improvements: ["Add a short conclusion."],
      practicePrompt: "Explain the same idea in three steps.",
    },
  }];

  await page.route("**/api/persistence", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [{ key: "speakup:speaking-feedback-history", value: JSON.stringify(saved) }] }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: true }) });
  });

  await page.goto("/speaking-feedback");
  await expect(page.getByRole("heading", { name: "AI Speaking Feedback" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Previous speaking reviews" })).toBeVisible();
  await expect(page.getByRole("button", { name: /82.*Explain a feature/i })).toBeVisible();
  await page.getByRole("button", { name: /Review/i }).click();
  await expect(page.getByRole("heading", { name: "Progress, not perfection" })).toBeVisible();
  await expect(page.getByLabel("Speech transcript")).toHaveValue(saved[0].transcript);
});
