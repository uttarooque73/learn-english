import { describe, expect, it } from "vitest";
import { buildSkillTrends, type CurrentSkillEstimate, type SkillAssessmentPoint } from "@/lib/learning-insights";

const now = new Date("2026-10-19T12:00:00.000Z");

const assessments: SkillAssessmentPoint[] = [
  { skillKey: "grammar", score: 0.5, confidence: 0.5, createdAt: "2026-09-02T12:00:00.000Z" },
  { skillKey: "grammar", score: 0.55, confidence: 0.55, createdAt: "2026-09-10T12:00:00.000Z" },
  { skillKey: "grammar", score: 0.7, confidence: 0.65, createdAt: "2026-10-01T12:00:00.000Z" },
  { skillKey: "grammar", score: 0.8, confidence: 0.7, createdAt: "2026-10-15T12:00:00.000Z" },
  { skillKey: "speaking", score: 0.3, confidence: 0.4, createdAt: "2026-10-15T13:00:00.000Z" },
  { skillKey: "grammar", score: 1.5, confidence: 0.8, createdAt: "2026-10-16T12:00:00.000Z" },
];

const currentSkills: CurrentSkillEstimate[] = [
  { skillKey: "grammar", mastery: 0.65, confidence: 0.7, evidenceCount: 4, updatedAt: "2026-10-15T12:00:00.000Z" },
  { skillKey: "speaking", mastery: 0.35, confidence: 0.4, evidenceCount: 1, updatedAt: "2026-10-15T13:00:00.000Z" },
  { skillKey: "vocabulary", mastery: 0.6, confidence: 0.5, evidenceCount: 0, updatedAt: "2026-10-01T12:00:00.000Z" },
];

describe("evidence-based learning skill trends", () => {
  it("compares recent and previous assessment periods and returns eight weekly buckets", () => {
    const trends = buildSkillTrends(assessments, currentSkills, now);
    const grammar = trends.find((skill) => skill.skillKey === "grammar");

    expect(grammar?.trend).toBe("improving");
    expect(grammar?.changePoints).toBe(23);
    expect(grammar?.recentSampleCount).toBe(2);
    expect(grammar?.previousSampleCount).toBe(2);
    expect(grammar?.weeklyScores).toHaveLength(8);
    expect(grammar?.latestScore).toBe(0.8);
  });

  it("does not label a skill as improving until both comparison periods have enough evidence", () => {
    const trends = buildSkillTrends(assessments, currentSkills, now);
    const speaking = trends.find((skill) => skill.skillKey === "speaking");
    expect(speaking?.trend).toBe("building-baseline");
    expect(speaking?.changePoints).toBeNull();
    expect(speaking?.evidenceCount).toBe(1);
  });

  it("sorts evidence-backed focus skills before estimates with no recorded evidence", () => {
    const trends = buildSkillTrends(assessments, currentSkills, now);
    expect(trends[0]?.skillKey).toBe("speaking");
    expect(trends.at(-1)?.skillKey).toBe("vocabulary");
    expect(buildSkillTrends([], [], now)).toEqual([]);
  });
});
