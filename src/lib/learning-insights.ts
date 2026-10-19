export type SkillAssessmentPoint = {
  skillKey: string;
  score: number;
  confidence: number;
  createdAt: string;
};

export type CurrentSkillEstimate = {
  skillKey: string;
  mastery: number;
  confidence: number;
  evidenceCount: number;
  updatedAt: string;
};

export type SkillTrendPoint = {
  weekStart: string;
  label: string;
  score: number | null;
  sampleCount: number;
};

export type SkillTrend = {
  skillKey: string;
  mastery: number;
  confidence: number;
  evidenceCount: number;
  latestScore: number | null;
  latestAssessmentAt: string | null;
  trend: "improving" | "needs-attention" | "steady" | "building-baseline";
  changePoints: number | null;
  recentSampleCount: number;
  previousSampleCount: number;
  weeklyScores: SkillTrendPoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function validScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function mondayUtc(date: Date): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function labelForWeek(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Build deterministic, evidence-backed eight-week skill trends without model-generated claims. */
export function buildSkillTrends(
  assessments: SkillAssessmentPoint[],
  currentSkills: CurrentSkillEstimate[],
  now = new Date(),
): SkillTrend[] {
  const validAssessments = assessments.filter((item) =>
    typeof item.skillKey === "string" && item.skillKey.trim().length > 0 &&
    validScore(item.score) && Number.isFinite(Date.parse(item.createdAt)),
  );
  const currentBySkill = new Map(currentSkills.map((item) => [item.skillKey, item]));
  const skillKeys = new Set<string>([
    ...currentSkills.map((item) => item.skillKey),
    ...validAssessments.map((item) => item.skillKey),
  ]);
  const currentWeek = mondayUtc(now);
  const firstWeek = new Date(currentWeek.getTime() - 7 * WEEK_MS);
  const weekStarts = Array.from({ length: 8 }, (_, index) => new Date(firstWeek.getTime() + index * WEEK_MS));
  const recentStart = now.getTime() - 28 * DAY_MS;
  const previousStart = now.getTime() - 56 * DAY_MS;

  const trends: SkillTrend[] = [];
  for (const skillKey of skillKeys) {
    const skillAssessments = validAssessments
      .filter((item) => item.skillKey === skillKey)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    const current = currentBySkill.get(skillKey);
    const latest = skillAssessments[skillAssessments.length - 1];
    const recentScores = skillAssessments.filter((item) => {
      const time = Date.parse(item.createdAt);
      return time >= recentStart && time <= now.getTime();
    }).map((item) => item.score);
    const previousScores = skillAssessments.filter((item) => {
      const time = Date.parse(item.createdAt);
      return time >= previousStart && time < recentStart;
    }).map((item) => item.score);
    const recentAverage = average(recentScores);
    const previousAverage = average(previousScores);
    const changePoints = recentAverage !== null && previousAverage !== null && recentScores.length >= 2 && previousScores.length >= 2
      ? Math.round((recentAverage - previousAverage) * 100 + 1e-8)
      : null;
    const trend: SkillTrend["trend"] = changePoints === null ? "building-baseline"
      : changePoints >= 4 ? "improving"
        : changePoints <= -4 ? "needs-attention" : "steady";

    const weeklyScores = weekStarts.map((weekStart) => {
      const weekEnd = new Date(weekStart.getTime() + WEEK_MS);
      const scores = skillAssessments.filter((item) => {
        const time = Date.parse(item.createdAt);
        return time >= weekStart.getTime() && time < weekEnd.getTime() && time <= now.getTime();
      }).map((item) => item.score);
      const weekAverage = average(scores);
      return {
        weekStart: weekStart.toISOString().slice(0, 10),
        label: labelForWeek(weekStart),
        score: weekAverage === null ? null : Math.round(weekAverage * 100),
        sampleCount: scores.length,
      };
    });

    trends.push({
      skillKey,
      mastery: validScore(current?.mastery) ? current!.mastery : latest?.score ?? 0,
      confidence: validScore(current?.confidence) ? current!.confidence : latest?.confidence ?? 0,
      evidenceCount: current?.evidenceCount ?? skillAssessments.length,
      latestScore: latest?.score ?? null,
      latestAssessmentAt: latest?.createdAt ?? null,
      trend,
      changePoints,
      recentSampleCount: recentScores.length,
      previousSampleCount: previousScores.length,
      weeklyScores,
    });
  }

  return trends.sort((left, right) => Number(right.evidenceCount > 0) - Number(left.evidenceCount > 0) || left.mastery - right.mastery || right.evidenceCount - left.evidenceCount || left.skillKey.localeCompare(right.skillKey));
}
