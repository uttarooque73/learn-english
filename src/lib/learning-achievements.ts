export type AchievementStats = {
  completedSessions: number;
  practiceMinutes: number;
  longestStreak: number;
  currentStreak: number;
  uniqueVocabularyReviewed: number;
  totalVocabularyReviews: number;
  highScoringAssessments: number;
  grammarAssessments: number;
  completedPlans: number;
  resolvedMistakes: number;
  masteredSkills: number;
};

export type AchievementDefinition = {
  key: string;
  title: string;
  description: string;
  category: "practice" | "consistency" | "skills" | "vocabulary";
  icon: string;
  metric: keyof AchievementStats;
  target: number;
  unit: string;
};

export type AchievementCard = AchievementDefinition & {
  value: number;
  progress: number;
  progressPercent: number;
  unlocked: boolean;
  earnedAt: string | null;
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { key: "first-session", title: "First Steps", description: "Complete your first saved practice session.", category: "practice", icon: "🌱", metric: "completedSessions", target: 1, unit: "session" },
  { key: "five-sessions", title: "Finding Your Rhythm", description: "Complete five practice sessions.", category: "practice", icon: "🎯", metric: "completedSessions", target: 5, unit: "sessions" },
  { key: "hour-of-practice", title: "One Hour Stronger", description: "Accumulate an hour of saved practice time.", category: "practice", icon: "⏱", metric: "practiceMinutes", target: 60, unit: "minutes" },
  { key: "three-day-streak", title: "Three-Day Spark", description: "Practice on three consecutive days.", category: "consistency", icon: "🔥", metric: "longestStreak", target: 3, unit: "day streak" },
  { key: "seven-day-streak", title: "A Week of Words", description: "Practice on seven consecutive days.", category: "consistency", icon: "🏆", metric: "longestStreak", target: 7, unit: "day streak" },
  { key: "vocabulary-ten", title: "Word Collector", description: "Review ten different vocabulary items.", category: "vocabulary", icon: "📚", metric: "uniqueVocabularyReviewed", target: 10, unit: "words" },
  { key: "vocabulary-fifty-reviews", title: "Recall in Action", description: "Complete fifty vocabulary reviews.", category: "vocabulary", icon: "🧠", metric: "totalVocabularyReviews", target: 50, unit: "reviews" },
  { key: "assessment-ace", title: "Assessment Ace", description: "Score 85% or higher on three saved skill assessments.", category: "skills", icon: "✨", metric: "highScoringAssessments", target: 3, unit: "assessments" },
  { key: "grammar-explorer", title: "Grammar Explorer", description: "Complete a saved grammar assessment.", category: "skills", icon: "✍️", metric: "grammarAssessments", target: 1, unit: "assessment" },
  { key: "plan-finisher", title: "Plan in Motion", description: "Complete three daily learning plans.", category: "practice", icon: "🗓", metric: "completedPlans", target: 3, unit: "plans" },
  { key: "mistake-solver", title: "Mistake Solver", description: "Resolve five recurring mistakes through practice.", category: "skills", icon: "💡", metric: "resolvedMistakes", target: 5, unit: "mistakes" },
  { key: "skill-builder", title: "Well-Rounded Learner", description: "Reach 80% mastery in three skills.", category: "skills", icon: "🌟", metric: "masteredSkills", target: 3, unit: "skills" },
];

export function buildAchievementCards(
  stats: AchievementStats,
  earnedAtByKey: ReadonlyMap<string, string> = new Map(),
): AchievementCard[] {
  return ACHIEVEMENTS.map((achievement) => {
    const value = Math.max(0, Number.isFinite(stats[achievement.metric]) ? stats[achievement.metric] : 0);
    const earnedAt = earnedAtByKey.get(achievement.key) ?? null;
    const unlocked = value >= achievement.target || earnedAt !== null;
    return {
      ...achievement,
      value,
      progress: Math.min(achievement.target, value),
      progressPercent: Math.min(100, Math.round((value / achievement.target) * 100)),
      unlocked,
      earnedAt,
    };
  });
}
