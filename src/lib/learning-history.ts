export type LearningHistoryKind = "practice" | "assessment" | "vocabulary";

export type LearningHistoryItem = {
  id: string;
  kind: LearningHistoryKind;
  title: string;
  description: string;
  occurredAt: string;
  href: string;
  durationMinutes?: number;
  scorePercent?: number;
  details: string[];
};

type PracticeRow = {
  id: string;
  activityType: string;
  resultJson: string;
  durationSeconds: number;
  createdAt: string;
  completedAt: string | null;
};

type AssessmentRow = {
  id: string;
  skillKey: string;
  score: number;
  evidenceJson: string;
  createdAt: string;
};

type VocabularyReviewRow = {
  id: string;
  vocabularyRef: string;
  recallRating: number;
  intervalDays: number;
  nextDueAt: string | null;
  createdAt: string;
};

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function objectFromJson(value: string): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function cleanText(value: unknown, maxLength = 240): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? cleanText(item, 180) : null).filter((item): item is string => Boolean(item)).slice(0, 5);
}

function practiceTitle(activityType: string): string {
  const labels: Record<string, string> = {
    conversation: "Conversation practice",
    "conversation-coach": "Conversation practice",
    speaking: "Speaking practice",
    pronunciation: "Pronunciation practice",
    grammar: "Grammar practice",
    vocabulary: "Vocabulary practice",
    assessment: "Skill assessment",
    listening: "Listening practice",
    "word-sentence": "Words and sentences",
    "challenge-simulator": "Real-world challenge",
  };
  if (labels[activityType.toLowerCase()]) return labels[activityType.toLowerCase()];
  return activityType.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80) || "Practice session";
}

function practiceHref(activityType: string): string {
  const routes: Record<string, string> = {
    conversation: "/conversation-coach",
    "conversation-coach": "/conversation-coach",
    speaking: "/live-speaking-roleplay",
    pronunciation: "/pronunciation-coach",
    grammar: "/sentence-improver",
    vocabulary: "/vocabulary",
    assessment: "/assessment",
    listening: "/listening-lab",
    "word-sentence": "/word-practice",
    "challenge-simulator": "/challenge-simulator",
  };
  return routes[activityType.toLowerCase()] ?? "/practice";
}

function scorePercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const percent = value >= 0 && value <= 1 ? value * 100 : value;
  return Math.round(Math.max(0, Math.min(100, percent)));
}

function resultDetails(result: Record<string, unknown>): string[] {
  const details = [
    ...stringList(result.strengths),
    ...stringList(result.improvements),
    ...stringList(result.tips),
  ];
  if (Array.isArray(result.corrections)) {
    for (const correction of result.corrections.slice(0, 5)) {
      if (!correction || typeof correction !== "object") continue;
      const entry = correction as Record<string, unknown>;
      const original = cleanText(entry.original, 100);
      const improved = cleanText(entry.improved ?? entry.corrected, 100);
      if (original && improved) details.push(`Try “${improved}” instead of “${original}”.`);
    }
  }
  return [...new Set(details)].slice(0, 8);
}

export function buildLearningHistory(
  practices: PracticeRow[],
  assessments: AssessmentRow[],
  reviews: VocabularyReviewRow[],
): LearningHistoryItem[] {
  const items: LearningHistoryItem[] = [];

  for (const row of practices) {
    const result = objectFromJson(row.resultJson);
    const description = cleanText(result.summary) ?? cleanText(result.feedback) ??
      cleanText(result.explanation) ?? cleanText(result.message) ?? "Your completed practice session was saved.";
    const score = scorePercent(result.score ?? result.accuracy);
    items.push({
      id: "practice:" + row.id,
      kind: "practice",
      title: practiceTitle(row.activityType),
      description,
      occurredAt: row.completedAt ?? row.createdAt,
      href: practiceHref(row.activityType),
      durationMinutes: Math.max(0, Math.round((row.durationSeconds ?? 0) / 60)),
      ...(score !== undefined ? { scorePercent: score } : {}),
      details: resultDetails(result),
    });
  }

  for (const row of assessments) {
    const parsed = parseJson(row.evidenceJson);
    const evidence = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    const details = resultDetails(evidence);
    for (const entry of Array.isArray(parsed) ? parsed.slice(0, 5) : []) {
      if (!entry || typeof entry !== "object") continue;
      const value = entry as Record<string, unknown>;
      const explanation = cleanText(value.explanation ?? value.feedback ?? value.topic);
      if (explanation) details.push(explanation);
    }
    const skill = row.skillKey.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    items.push({
      id: "assessment:" + row.id,
      kind: "assessment",
      title: skill + " assessment",
      description: cleanText(evidence.summary) ?? `Saved assessment result for ${skill.toLowerCase()}.`,
      occurredAt: row.createdAt,
      href: "/assessment",
      scorePercent: scorePercent(row.score) ?? 0,
      details: [...new Set(details)].slice(0, 8),
    });
  }

  for (const row of reviews) {
    items.push({
      id: "vocabulary:" + row.id,
      kind: "vocabulary",
      title: "Vocabulary review",
      description: /^[0-9a-f-]{30,}$/i.test(row.vocabularyRef) ? "Reviewed a saved vocabulary item and recorded recall." : "Reviewed “" + row.vocabularyRef.slice(0, 120) + "” and recorded recall.",
      occurredAt: row.createdAt,
      href: "/smart-vocabulary-revision",
      details: [
        `Recall rating: ${row.recallRating} out of 5.`,
        `Next review interval: ${row.intervalDays} day(s).`,
        ...(row.nextDueAt ? [`Next due: ${row.nextDueAt.slice(0, 10)}.`] : []),
      ],
    });
  }

  return items
    .filter((item) => Number.isFinite(Date.parse(item.occurredAt)))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 200);
}
