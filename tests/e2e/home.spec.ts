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
  await expect(page.getByText(/coach adapts its vocabulary and questions to your level/i)).toBeVisible();

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
  await page.getByLabel("Transcript of your spoken answer").fill("Um, I like this tool, you know, because it helps.");
  await expect(page.getByText("3 possible filler words detected")).toBeVisible();
  await page.getByRole("button", { name: "Finish exercise" }).click();
  await expect(page.getByRole("status")).toContainText("Your transcript contains 10 words.");
});

test("practice room generates a structured session summary", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    const payload = route.request().postDataJSON() as { mode?: string };
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: payload.mode === "follow-up" ? "What specific result did you achieve?" : payload.mode === "simplify" ? "I have worked here since 2020. This means I started in 2020 and still work here." : "Tell me about your experience.",
    });
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
  await page.getByRole("button", { name: "Ask a follow-up question" }).click();
  await expect(page.getByText("What specific result did you achieve?")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Explain more simply" }).click();
  await expect(page.getByText("I have worked here since 2020. This means I started in 2020 and still work here.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Summarize session/ })).toBeEnabled({ timeout: 10_000 });
  await page.getByRole("button", { name: /Summarize session/ }).click();
  await expect(page.getByRole("heading", { name: "Your learning summary" })).toBeVisible();
  await expect(page.getByText("hands-on experience")).toBeVisible();
  await expect(page.getByText("Repeat the answer and include one measurable result.")).toBeVisible();

  await page.getByRole("button", { name: "New conversation" }).click();
  const savedConversations = page.getByLabel("Saved conversations");
  const savedOption = savedConversations.locator("option").nth(1);
  await expect(savedOption).toContainText("summary saved");
  await savedConversations.selectOption(await savedOption.getAttribute("value") ?? "");
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: "Your learning summary" })).toBeVisible();
  await expect(page.getByText("Repeat the answer and include one measurable result.")).toBeVisible();
});

test("learning preferences save and persist personalization and accessibility choices", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForTimeout(1000);
  await expect(page.getByRole("heading", { name: "Learning preferences" })).toBeVisible();

  await page.getByLabel("Current English level").selectOption("Intermediate");
  await page.getByLabel("Feedback style").selectOption("detailed");
  await page.getByLabel("Daily practice goal").selectOption("15");
  await page.getByLabel("Speaking speed").selectOption("1.2");
  await page.getByLabel("English voice").selectOption("");
  await page.getByLabel("Explain a technical concept").check();
  await page.getByLabel("Larger text").check();
  await page.getByLabel("Reduce animation").check();
  await page.getByRole("button", { name: /Save preferences/ }).click();
  await expect(page.getByText("Your preferences are saved on this device.", { exact: true })).toBeVisible();

  await page.reload();
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("Current English level")).toHaveValue("Intermediate");
  await expect(page.getByLabel("Feedback style")).toHaveValue("detailed");
  await expect(page.getByLabel("Daily practice goal")).toHaveValue("15");
  await expect(page.getByLabel("Speaking speed")).toHaveValue("1.2");
  await expect(page.getByLabel("English voice")).toHaveValue("");
  await expect(page.getByLabel("Explain a technical concept")).toBeChecked();
  await expect(page.getByLabel("Larger text")).toBeChecked();
  await expect(page.getByLabel("Reduce animation")).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/speakup-larger-text/);
  await expect(page.locator("html")).toHaveClass(/speakup-reduced-motion/);

  await page.goto("/");
  await page.waitForTimeout(1000);
  await expect(page.getByRole("progressbar", { name: "Daily practice goal" })).toHaveAttribute("aria-valuemax", "15");
});

test("vocabulary review schedules the next review from learner recall", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("speakup:vocabulary:v1", JSON.stringify([{
      id: "review-word-1",
      phrase: "hands-on experience",
      meaning: "Practical experience doing something.",
      example: "I have hands-on experience with this tool.",
      savedAt: "2026-10-15T12:00:00.000Z",
      status: "learning"
    }]));
  });
  await page.goto("/vocabulary");
  await expect(page.getByRole("heading", { name: "Your word bank" })).toBeVisible();
  await page.getByRole("button", { name: /Review due/ }).click();
  await expect(page.getByRole("heading", { name: "hands-on experience" })).toBeVisible();
  await page.getByRole("button", { name: "Reveal meaning" }).click();
  await expect(page.getByText("Practical experience doing something.")).toBeVisible();
  await page.getByRole("button", { name: "Got it · 3 days" }).click();
  await expect(page.getByRole("heading", { name: "You're all caught up" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Review due/ })).toContainText("0");
});

test("progress page shows streaks, weekly activity, vocabulary review stats, and correction patterns", async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date();
    const dayAt = (offset: number) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
      date.setDate(date.getDate() + offset);
      return date.toISOString();
    };
    const summary = {
      topicSummary: "Practised work introductions.",
      keyPoints: ["Introduced role"],
      corrections: [{ original: "I am work here.", improved: "I work here.", reason: "Use the simple present." }],
      vocabulary: [],
      strengths: ["Clear example"],
      improvements: ["Add a result"],
      followUpExercise: "Try once more.",
    };
    window.localStorage.setItem("speakup:sessions:v1", JSON.stringify([
      { id: "today", scenario: "Daily stand-up", startedAt: dayAt(0), updatedAt: dayAt(0), durationSeconds: 900, messageCount: 2, learnerMessages: ["I am work here."], summary },
      { id: "yesterday", scenario: "Job interview", startedAt: dayAt(-1), updatedAt: dayAt(-1), durationSeconds: 1800, messageCount: 3, learnerMessages: ["Tell me about your role."], summary },
    ]));
    window.localStorage.setItem("speakup:vocabulary:v1", JSON.stringify([
      { id: "reviewed", phrase: "follow up", meaning: "Continue later", example: "I'll follow up.", savedAt: dayAt(0), status: "familiar", reviewCount: 2, lastReviewedAt: dayAt(0), nextReviewAt: dayAt(1) },
      { id: "mastered", phrase: "clear up", meaning: "Explain", example: "Let me clear this up.", savedAt: dayAt(0), status: "mastered", reviewCount: 1 },
    ]));
  });
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "My progress" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice streak" })).toBeVisible();
  await expect(page.getByText("Current days")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your weekly rhythm" })).toBeVisible();
  await expect(page.getByText("Sessions this week")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review progress" })).toBeVisible();
  await expect(page.getByText("Items reviewed")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Correction patterns" })).toBeVisible();
  await expect(page.getByText("I work here.", { exact: true })).toBeVisible();
});



test("shadowing supports blind practice and persists custom sentences in the database", async ({ page }) => {
  await page.goto("/shadowing");
  await expect(page.getByRole("heading", { name: "Shadowing practice" })).toBeVisible();

  const blindMode = page.getByRole("button", { name: "◉ Blind mode", exact: true });
  await blindMode.click();
  await expect(page.getByRole("button", { name: "◉ Blind mode on" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".shadowing-sentence")).toContainText("Listen first, repeat from memory");
  await page.getByRole("button", { name: "Reveal target" }).click();
  await expect(page.locator(".shadowing-sentence")).toContainText("Could you give me a moment to think about that?");
  await expect(page.getByRole("button", { name: "Hide target" })).toBeVisible();

  const customSentence = "I am practising English every single day.";
  await page.getByLabel("Add a word or sentence to practise").fill(customSentence);
  await page.getByRole("button", { name: "Add to practice list" }).click();
  await expect(page.getByRole("status")).toContainText("Custom sentence saved to the database.");
  await expect(page.getByLabel("Practice sentence or word")).toContainText(customSentence);

  await page.reload();
  await expect(page.getByLabel("Practice sentence or word")).toContainText(customSentence);
});

test("mobile navigation and practice chat work without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "I can help you practise English." });
  });

  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /width=device-width/);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.getByRole("button", { name: "Open menu" }).click();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation).toBeVisible();
  await page.getByRole("link", { name: "Practice room" }).click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");

  const interview = page.getByRole("button", { name: /Job interview/ });
  await expect(interview).toBeVisible();
  await interview.click();
  await page.locator("#chat-message").fill("I want to practise speaking.");
  await page.getByRole("button", { name: /Send message/ }).click();
  await expect(page.getByText("I can help you practise English.")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  for (const route of ["/", "/practice", "/vocabulary", "/progress", "/fluency", "/settings"]) {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(route);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});


test("voice practice explains the text fallback when speech recognition is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
  });
  await page.goto("/practice");
  await expect(page.getByRole("button", { name: "Start voice conversation" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText(/Voice input is not supported/);
  await expect(page.getByLabel("Your message")).toBeEnabled();
  await expect(page.getByRole("button", { name: /Send message/ })).toBeDisabled();
});


test("immediate English feedback distinguishes grammar errors and offers a practice prompt", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("speakup:preferences:v1", JSON.stringify({
      englishLevel: "Beginner", dailyGoalMinutes: 10, feedbackStyle: "balanced",
      feedbackTiming: "immediate", preferredTopics: ["Everyday life", "At work"],
      largerText: false, reducedMotion: false
    }));
  });
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "What did you do yesterday?" });
  });
  await page.route("**/api/feedback", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      originalSentence: "I go to work yesterday.",
      correctedSentence: "I went to work yesterday.",
      explanation: "Use the past tense for something that finished yesterday.",
      issues: [{ original: "I go", corrected: "I went", category: "grammar", importance: "important", explanation: "Yesterday is in the past, so use went." }],
      practicePrompt: "Tell your coach one more thing you did yesterday.",
      tips: ["Use went for yesterday."], pronunciationTip: "Say the final consonants clearly.", vocabulary: []
    }) });
  });
  await page.goto("/practice");
  await page.getByLabel("Your message").fill("I go to work yesterday.");
  await page.getByRole("button", { name: /Send message/ }).click();
  await expect(page.getByRole("region", { name: "English feedback" })).toBeVisible();
  await expect(page.getByText("You wrote")).toBeVisible();
  await expect(page.getByText("Corrected version")).toBeVisible();
  await expect(page.getByText("Important correction")).toBeVisible();
  await expect(page.getByText("Use went for yesterday.")).toBeVisible();
  await page.getByRole("button", { name: "Practice this prompt" }).click();
  await expect(page.getByLabel("Your message")).toHaveValue("Tell your coach one more thing you did yesterday.");
});


test("vocabulary expression library explains and saves collocations and phrasal verbs", async ({ page }) => {
  await page.goto("/vocabulary");
  await page.getByRole("button", { name: "Useful expressions" }).click();
  const library = page.getByRole("region", { name: "Collocations, phrasal verbs, and common expressions" });
  await expect(library).toBeVisible();
  await expect(library.getByRole("heading", { name: "make a decision" })).toBeVisible();
  await expect(library.getByText("collocation", { exact: true }).first()).toBeVisible();
  await expect(library.getByText("Choose what to do after thinking about the options.")).toBeVisible();
  await library.getByRole("button", { name: "Save expression: make a decision" }).click();
  await expect(library.getByRole("button", { name: "make a decision saved" })).toBeDisabled();
  await page.getByRole("button", { name: "Word bank" }).click();
  await expect(page.getByRole("heading", { name: "make a decision" })).toBeVisible();
  await expect(page.getByText("We need to make a decision before Friday.")).toBeVisible();
});


test("settings can permanently clear saved sessions and vocabulary after confirmation", async ({ page }) => {
  await page.request.post("/api/persistence", { data: { key: "speakup:sessions:v1", value: JSON.stringify([{ id: "saved-session", scenario: "At work", startedAt: "2026-10-16T10:00:00.000Z", updatedAt: "2026-10-16T10:01:00.000Z", durationSeconds: 60, messageCount: 1, learnerMessages: ["I finished the task."] }]) } });
  await page.request.post("/api/persistence", { data: { key: "speakup:vocabulary:v1", value: JSON.stringify([{ id: "saved-word", phrase: "meet a deadline", meaning: "Finish on time.", example: "We met the deadline.", savedAt: "2026-10-16T10:00:00.000Z" }]) } });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Your saved learning data" })).toBeVisible();
  await expect(page.getByText("Saved conversations").locator("..").getByText("1")).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete all saved practice data" }).click();
  await expect(page.getByRole("status").filter({ hasText: "All saved conversations, summaries, and vocabulary have been deleted" })).toBeVisible();
  const afterDelete = await page.request.get("/api/persistence");
  const deletedEntries = await afterDelete.json() as { entries: Array<{ key: string; value: string }> };
  expect(deletedEntries.entries.filter((entry) => ["speakup:sessions:v1", "speakup:vocabulary:v1"].includes(entry.key))).toHaveLength(0);
});

test("a learner can delete one saved conversation from Practice Room history", async ({ page }) => {
  await page.request.post("/api/persistence", { data: { key: "speakup:sessions:v1", value: JSON.stringify([
    { id: "session-to-delete", scenario: "At work", startedAt: "2026-10-16T10:00:00.000Z", updatedAt: "2026-10-16T10:01:00.000Z", durationSeconds: 60, messageCount: 1, learnerMessages: ["I finished the task."], messages: [{ role: "user", content: "I finished the task." }, { role: "assistant", content: "Great work." }] },
    { id: "session-to-keep", scenario: "Everyday life", startedAt: "2026-10-15T10:00:00.000Z", updatedAt: "2026-10-15T10:01:00.000Z", durationSeconds: 60, messageCount: 1, learnerMessages: ["I went shopping."] }
  ]) } });
  await page.goto("/practice");
  await page.getByLabel("Saved conversations").selectOption("session-to-delete");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect(page.getByLabel("Saved conversations")).toContainText("Recent conversations (1)");
  const persisted = await page.request.get("/api/persistence");
  const persistedPayload = await persisted.json() as { entries: Array<{ key: string; value: string }> };
  const savedSessions = JSON.parse(persistedPayload.entries.find((entry) => entry.key === "speakup:sessions:v1")?.value ?? "[]") as Array<{ id: string }>;
  expect(savedSessions.map((session) => session.id)).toEqual(["session-to-keep"]);
});


test("phoneme assessment records audio and displays sound-level feedback from the local service", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(_stream: MediaStream) {}
      start() { this.state = "recording"; this.ondataavailable?.({ data: new Blob(["fake audio"], { type: this.mimeType }) }); }
      stop() { this.state = "inactive"; this.onstop?.(); }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  });
  await page.route("**/api/chat", async (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "Tell me what you did yesterday." }));
  await page.route("**/api/feedback", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    originalSentence: "I go yesterday.", correctedSentence: "I went yesterday.", explanation: "Use past tense.", issues: [], practicePrompt: "Tell me one more thing you did yesterday.", tips: [], pronunciationTip: "Say each word clearly.", vocabulary: []
  }) }));
  await page.route("**/api/pronunciation", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    score: 82, transcript: "I went yesterday", phonemeErrorRate: 0.12, wordErrorRate: 0,
    errors: [{ word: "went", expected: "w ɛ n t", actual: "w ɪ n", confidence: 0.88, phones: [{ expected: "ɛ", heard: "ɪ", confidence: 0.88 }] }]
  }) }));
  await page.goto("/practice");
  await page.getByLabel("Your message").fill("I go yesterday.");
  await page.getByRole("button", { name: /Send message/ }).click();
  await expect(page.getByText("Tell me what you did yesterday.")).toBeVisible();
  await page.getByRole("button", { name: "Get feedback" }).click();
  const feedback = page.getByRole("region", { name: "English feedback" });
  await expect(feedback).toBeVisible();
  await feedback.getByRole("button", { name: "Record pronunciation" }).click();
  await feedback.getByRole("button", { name: "Stop and assess" }).click();
  await expect(feedback.getByText("82", { exact: true })).toBeVisible();
  await expect(feedback.getByText("Sounds to practice")).toBeVisible();
  await expect(feedback.getByText("went", { exact: true })).toBeVisible();
});


test("session goal guides the tutor and the optional timer ends a timed session", async ({ page }) => {
  let chatBody: Record<string, unknown> | undefined;
  await page.route("**/api/chat", async (route) => {
    chatBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "text/plain", body: "Let us practise a sentence together." });
  });
  await page.goto("/practice");
  await page.getByLabel("Session goal").selectOption("Improve grammar");
  await page.getByLabel("Session duration").selectOption("5");
  await page.getByLabel("Your message").fill("I work yesterday.");
  await page.getByRole("button", { name: /Send message/ }).click();
  await expect(page.getByText("Let us practise a sentence together.")).toBeVisible();
  await expect.poll(() => chatBody).toMatchObject({ sessionGoal: "Improve grammar", sessionDurationMinutes: 5 });
  await expect(page.getByRole("timer").filter({ hasText: /Time left 0[45]:[0-5][0-9]/ })).toBeVisible();
  await page.evaluate(() => { const start = Date.now(); Date.now = () => start + 6 * 60 * 1000; });
  await expect(page.getByRole("timer").filter({ hasText: "Session time is up" })).toBeVisible({ timeout: 4000 });
  await expect(page.getByLabel("Your message")).toBeDisabled();
  await expect(page.getByRole("button", { name: /Time is up/ })).toBeDisabled();
});


test("selected text can be saved to vocabulary from different app pages", async ({ page }) => {
  await page.request.delete("/api/persistence");
  for (const route of ["/vocabulary", "/settings"]) {
    await page.goto(route);
    await page.waitForFunction(() => document.documentElement.dataset.vocabularySelectionReady === "true");
    await page.evaluate(() => {
      const heading = document.querySelector("h1");
      if (!heading) throw new Error("Expected page heading");
      const range = document.createRange();
      range.selectNodeContents(heading);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, view: window }));
    });
    await page.locator(".vocabulary-selection-action").getByRole("button", { name: "Add selected text to vocabulary" }).click();
    await expect(page.getByRole("form", { name: "Add selected text to vocabulary" })).toBeVisible();
    await page.getByLabel("Meaning (optional)").fill("A test meaning");
    await page.getByLabel("Example (optional)").fill("This is an example.");
    await page.getByRole("button", { name: "Save to vocabulary" }).click();
    await expect(page.locator(".vocabulary-selection-status")).toContainText(/Saved .* to your vocabulary/);
    await expect.poll(async () => {
      const response = await page.request.get("/api/persistence");
      const payload = await response.json() as { entries: Array<{ key: string; value: string }> };
      const entry = payload.entries.find((item) => item.key === "speakup:vocabulary:v1");
      const words = JSON.parse(entry?.value ?? "[]") as { phrase: string; meaning: string; example: string }[];
      return words.some((word) => word.meaning === "A test meaning" && word.example === "This is an example.");
    }).toBeTruthy();
    await page.request.delete("/api/persistence?key=speakup%3Avocabulary%3Av1");
  }
});


test("floating English partner opens, configures a topic, and loads saved-history state", async ({ page }) => {
  await page.route("**/api/voice-conversations/preferences", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sentenceFeedbackEnabled: true, repeatAfterFeedbackEnabled: true }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: route.request().postData() ?? "{}" });
    }
  });
  await page.route("**/api/voice-conversations/session", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open AI English Partner" }).click();
  await expect(page.getByRole("dialog", { name: "AI English Partner" })).toBeVisible();
  await page.getByLabel("Topic").selectOption("Custom Topic");
  await expect(page.getByRole("textbox", { name: "Custom topic" })).toBeVisible();
  await page.getByRole("textbox", { name: "Custom topic" }).fill("Explaining a software release");
  await page.getByLabel("English level").selectOption("Advanced");
  await expect(page.getByLabel("English level")).toHaveValue("Advanced");
  const sentenceFeedbackToggle = page.getByRole("checkbox", { name: "Feedback after every sentence" });
  await expect(sentenceFeedbackToggle).toBeChecked();
  await sentenceFeedbackToggle.uncheck();
  await expect(page.getByRole("checkbox", { name: "Enable repeat practice after feedback" })).toBeDisabled();
  await sentenceFeedbackToggle.check();
  await expect(page.getByRole("checkbox", { name: "Enable repeat practice after feedback" })).toBeChecked();

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("No saved conversations yet.")).toBeVisible();
});


test("floating English partner sends typed turns and renders plain-text AI replies and feedback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        speak(utterance: SpeechSynthesisUtterance) {
          window.setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), 0);
        },
      },
    });
  });
  await page.route("**/api/voice-conversations/preferences", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sentenceFeedbackEnabled: true, repeatAfterFeedbackEnabled: true }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: route.request().postData() ?? "{}" });
    }
  });
  await page.route("**/api/voice-conversations/session", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [] }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: true }) });
    }
  });
  await page.route("**/api/voice-conversations/sentence-feedback", async (route) => {
    const body = route.request().postDataJSON() as { message: { id: string; content: string } };
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ feedback: {
        messageId: body.message.id,
        originalSentence: body.message.content,
        correctedSentence: "I work as a software engineer.",
        naturalSentence: null,
        isCorrect: false,
        errorCategories: ["grammar"],
        severity: "minor",
        explanation: "Use an article before a singular countable job title.",
      } }),
    });
  });
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "That sounds interesting. What did you learn?" });
  });
  await page.route("**/api/voice-conversations/feedback", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          feedbackStatus: "complete",
          feedback: [{
            messageId: "learner-id",
            originalSentence: "I work as software engineer.",
            correctedSentence: "I work as a software engineer.",
            naturalSentence: null,
            isCorrect: false,
            errorCategories: ["grammar"],
            severity: "minor",
            explanation: "Use an article before a singular countable job title.",
          }],
          overallFeedback: {
            totalUtterances: 1, analyzedUtterances: 1, correctUtterances: 0,
            frequentErrors: [{ category: "grammar", count: 1 }],
            recommendations: ["Review articles before job titles."],
          },
        }),
      });
    } else {
      await route.continue();
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open AI English Partner" }).click();
  await page.getByRole("button", { name: "Start Conversation" }).click();
  const composer = page.getByLabel("Type a message");
  await expect(composer).toBeVisible();
  await composer.fill("I work as software engineer.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("That sounds interesting. What did you learn?")).toBeVisible();
  await expect(page.getByText("Sentence feedback")).toBeVisible();
  await expect(page.getByText("I work as a software engineer.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice corrected sentence" })).toBeVisible();
  await page.getByRole("button", { name: "Stop Conversation" }).click();
  await expect(page.getByText("Overall feedback")).toBeVisible();
  await expect(page.getByText("Use an article before a singular countable job title.")).toBeVisible();
});
