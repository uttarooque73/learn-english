import type { PracticeSession, SavedVocabulary } from "@/lib/learning-storage";

export type DailyLearningActivity = {
  date: string;
  label: string;
  sessions: number;
  minutes: number;
};

export type LearningAnalytics = {
  currentStreak: number;
  longestStreak: number;
  practiceDaysThisWeek: number;
  sessionsThisWeek: number;
  minutesThisWeek: number;
  sessionsThisMonth: number;
  minutesThisMonth: number;
  totalReviews: number;
  reviewedVocabularyCount: number;
  masteredVocabularyCount: number;
  recentActivity: DailyLearningActivity[];
  commonCorrections: { original: string; improved: string; count: number }[];
};

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAtOffset(now: Date, offset: number) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() + offset);
  return date;
}

function sessionDay(session: PracticeSession): string | undefined {
  const timestamp = Date.parse(session.startedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  return dayKey(new Date(timestamp));
}

export function getLearningAnalytics(
  sessions: PracticeSession[],
  vocabulary: SavedVocabulary[],
  now = new Date(),
): LearningAnalytics {
  const validSessions = sessions.filter((session) => Number.isFinite(Date.parse(session.startedAt)));
  const sessionsByDay = new Map<string, PracticeSession[]>();
  for (const session of validSessions) {
    const key = sessionDay(session);
    if (!key) continue;
    const group = sessionsByDay.get(key) ?? [];
    group.push(session);
    sessionsByDay.set(key, group);
  }

  const practicedDays = [...sessionsByDay.keys()].sort();
  const practicedDaySet = new Set(practicedDays);
  let longestStreak = 0;
  let streak = 0;
  let previousDay: string | undefined;
  for (const key of practicedDays) {
    const date = new Date(`${key}T00:00:00Z`);
    const previous = previousDay ? new Date(`${previousDay}T00:00:00Z`) : undefined;
    const consecutive = previous && date.getTime() - previous.getTime() === 24 * 60 * 60 * 1000;
    streak = consecutive ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previousDay = key;
  }

  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(dateAtOffset(now, -1));
  let currentStreak = 0;
  let streakCursor = practicedDaySet.has(todayKey) ? 0 : practicedDaySet.has(yesterdayKey) ? -1 : Number.NaN;
  while (Number.isFinite(streakCursor) && practicedDaySet.has(dayKey(dateAtOffset(now, streakCursor)))) {
    currentStreak += 1;
    streakCursor -= 1;
  }

  const startOfWeek = dateAtOffset(now, -((now.getDay() + 6) % 7));
  const weekSessions = validSessions.filter((session) => {
    const date = new Date(session.startedAt);
    return date >= startOfWeek && date <= now;
  });
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSessions = validSessions.filter((session) => {
    const date = new Date(session.startedAt);
    return date >= startOfMonth && date <= now;
  });

  const recentActivity = Array.from({ length: 7 }, (_, index) => {
    const date = dateAtOffset(now, index - 6);
    const daySessions = sessionsByDay.get(dayKey(date)) ?? [];
    return {
      date: dayKey(date),
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      sessions: daySessions.length,
      minutes: Math.round(daySessions.reduce((sum, session) => sum + Math.max(0, session.durationSeconds), 0) / 60),
    };
  });

  const correctionMap = new Map<string, { original: string; improved: string; count: number }>();
  for (const session of validSessions) {
    const seenInSession = new Set<string>();
    for (const correction of session.summary?.corrections ?? []) {
      const original = correction.original.trim();
      const improved = correction.improved.trim();
      if (!original || !improved) continue;
      const key = `${original.toLocaleLowerCase()}\u0000${improved.toLocaleLowerCase()}`;
      if (seenInSession.has(key)) continue;
      seenInSession.add(key);
      const existing = correctionMap.get(key);
      if (existing) existing.count += 1;
      else correctionMap.set(key, { original, improved, count: 1 });
    }
  }

  return {
    currentStreak,
    longestStreak,
    practiceDaysThisWeek: new Set(weekSessions.map(sessionDay).filter((day): day is string => Boolean(day))).size,
    sessionsThisWeek: weekSessions.length,
    minutesThisWeek: Math.round(weekSessions.reduce((sum, session) => sum + Math.max(0, session.durationSeconds), 0) / 60),
    sessionsThisMonth: monthSessions.length,
    minutesThisMonth: Math.round(monthSessions.reduce((sum, session) => sum + Math.max(0, session.durationSeconds), 0) / 60),
    totalReviews: vocabulary.reduce((sum, item) => sum + Math.max(0, item.reviewCount ?? 0), 0),
    reviewedVocabularyCount: vocabulary.filter((item) => (item.reviewCount ?? 0) > 0).length,
    masteredVocabularyCount: vocabulary.filter((item) => item.status === "mastered").length,
    recentActivity,
    commonCorrections: [...correctionMap.values()].sort((a, b) => b.count - a.count || a.original.localeCompare(b.original)).slice(0, 3),
  };
}
