import { expect, test } from "@playwright/test";

test("dashboard renders and opens the practice room", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Good to see you" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await page.getByRole("link", { name: /Start a practice session/i }).click();

  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByRole("heading", { name: "Practice room" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What feels right today?" })).toBeVisible();
});

test("practice room offers guided role-play scenarios and difficulty levels", async ({ page }) => {
  await page.goto("/practice");
  const interview = page.getByRole("button", { name: /Job interview/ });
  await expect(interview).toBeVisible();
  await expect(interview).toBeEnabled({ timeout: 10_000 });
  await interview.click();
  await expect(interview).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Daily stand-up/ })).toBeVisible();

  const difficulty = page.getByRole("combobox", { name: "Difficulty" });
  await expect(difficulty).toHaveValue("Beginner");
  await difficulty.selectOption("Advanced");
  await expect(difficulty).toHaveValue("Advanced");
  await expect(page.getByText(/coach adapts its vocabulary and question complexity/i)).toBeVisible();

  await expect(page.getByRole("button", { name: /Daily stand-up/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Explain a technical concept/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Restaurant conversation/ })).toBeVisible();
});

test("fluency page offers timed speaking and filler-word awareness exercises", async ({ page }) => {
  await page.goto("/fluency");
  await expect(page.getByRole("heading", { name: "Fluency & confidence" })).toBeVisible();

  const minuteTalk = page.getByRole("button", { name: /One-minute talk/ });
  await expect(minuteTalk).toBeVisible();
  await expect(minuteTalk).toBeEnabled({ timeout: 10_000 });
  await minuteTalk.click();
  await expect(minuteTalk).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("timer")).toHaveAttribute("aria-label", "60 seconds remaining");
  await page.getByRole("button", { name: "Start 1-minute timer" }).click();
  await expect(page.getByRole("button", { name: "Pause timer" })).toBeVisible();

  const fillers = page.getByRole("button", { name: /Filler-word awareness/ });
  await expect(fillers).toBeEnabled({ timeout: 10_000 });
  await fillers.click();
  await expect(fillers).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Your response").fill("Um, I like this tool, you know, because it helps.");
  await expect(page.getByText("3 possible filler words detected")).toBeVisible();
  await page.getByRole("button", { name: "Finish exercise" }).click();
  await expect(page.getByRole("status")).toContainText("You wrote 10 words.");
});

test("practice room generates a structured session summary", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "Tell me about your experience." });
  });
  await page.route("**/api/session-summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        topicSummary: "Practised introducing work experience.",
        keyPoints: ["Introduced current role"],
        corrections: [{ original: "I work here since 2020.", improved: "I have worked here since 2020.", reason: "Use present perfect for an action continuing to now." }],
        vocabulary: [{ phrase: "hands-on experience", meaning: "Practical experience doing something." }],
        strengths: ["Gave a relevant example"],
        improvements: ["Add a specific result"],
        followUpExercise: "Repeat the answer and include one measurable result.",
      }),
    });
  });
  await page.goto("/practice");
  const interview = page.getByRole("button", { name: /Job interview/ });
  await expect(interview).toBeVisible();
  await expect(interview).toBeEnabled({ timeout: 10_000 });
  await interview.click();
  await expect(interview).toHaveAttribute("aria-pressed", "true");

  await page.locator("#chat-message").fill("I work here since 2020.");
  await page.getByRole("button", { name: /Send message/ }).click();
  await expect(page.getByText("Tell me about your experience.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Summarize session/ })).toBeEnabled({ timeout: 10_000 });
  await page.getByRole("button", { name: /Summarize session/ }).click();
  await expect(page.getByRole("heading", { name: "Your learning summary" })).toBeVisible();
  await expect(page.getByText("hands-on experience")).toBeVisible();
  await expect(page.getByText("Repeat the answer and include one measurable result.")).toBeVisible();
});
