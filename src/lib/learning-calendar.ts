export type CalendarActivity = {
  date: string;
  kind: "practice" | "vocabulary" | "assessment";
  durationSeconds?: number;
  score?: number;
};

export type CalendarDay = {
  date: string;
  dayOfMonth: number;
  practiceSessions: number;
  practiceMinutes: number;
  vocabularyReviews: number;
  assessments: number;
  averageAssessmentScore: number | null;
  activityLevel: number;
  totalActivities: number;
};

export type LearningCalendar = {
  month: string;
  monthLabel: string;
  startOffset: number;
  daysInMonth: number;
  days: CalendarDay[];
  summary: {
    activeDays: number;
    practiceSessions: number;
    practiceMinutes: number;
    vocabularyReviews: number;
    assessments: number;
  };
  currentStreak: number;
  longestStreak: number;
};

export function localDateKey(timestamp: string | Date, timezone: string): string | null {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  let safeTimezone = timezone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: safeTimezone }).format(date);
  } catch {
    safeTimezone = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function localMonthKey(now: Date, timezone: string): string {
  return (localDateKey(now, timezone) ?? now.toISOString().slice(0, 10)).slice(0, 7);
}

function previousDayKey(day: string): string {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function buildLearningCalendar(
  month: string,
  timezone: string,
  activities: CalendarActivity[],
  now = new Date(),
): LearningCalendar {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must use YYYY-MM format.");
  const [year, monthNumber] = month.split("-").map(Number);
  const startOffset = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthLabel = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const byDate = new Map<string, CalendarDay>();
  const scoreTotals = new Map<string, { sum: number; count: number }>();
  const practiceDays = new Set<string>();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    byDate.set(date, {
      date, dayOfMonth: day, practiceSessions: 0, practiceMinutes: 0,
      vocabularyReviews: 0, assessments: 0, averageAssessmentScore: null,
      activityLevel: 0, totalActivities: 0,
    });
  }

  for (const activity of activities) {
    if (activity.kind === "practice") practiceDays.add(activity.date);
    const day = byDate.get(activity.date);
    if (!day) continue;
    if (activity.kind === "practice") {
      day.practiceSessions += 1;
      day.practiceMinutes += Math.max(0, activity.durationSeconds ?? 0) / 60;
    } else if (activity.kind === "vocabulary") {
      day.vocabularyReviews += 1;
    } else {
      day.assessments += 1;
      if (typeof activity.score === "number" && Number.isFinite(activity.score)) {
        const score = scoreTotals.get(activity.date) ?? { sum: 0, count: 0 };
        score.sum += activity.score;
        score.count += 1;
        scoreTotals.set(activity.date, score);
      }
    }
  }

  const days = [...byDate.values()].map((day) => {
    const totalActivities = day.practiceSessions + day.vocabularyReviews + day.assessments;
    const scores = scoreTotals.get(day.date);
    return {
      ...day,
      practiceMinutes: Math.round(day.practiceMinutes),
      averageAssessmentScore: scores && scores.count ? scores.sum / scores.count : null,
      totalActivities,
      activityLevel: totalActivities === 0 ? 0 : totalActivities >= 7 ? 4 : totalActivities >= 4 ? 3 : totalActivities >= 2 ? 2 : 1,
    };
  });

  const sortedPracticeDays = [...practiceDays].sort();
  let longestStreak = 0;
  let runningStreak = 0;
  let previous: string | null = null;
  for (const day of sortedPracticeDays) {
    runningStreak = previous && Date.parse(day + "T00:00:00Z") - Date.parse(previous + "T00:00:00Z") === 86_400_000
      ? runningStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, runningStreak);
    previous = day;
  }

  const todayKey = localDateKey(now, timezone) ?? now.toISOString().slice(0, 10);
  const yesterdayKey = previousDayKey(todayKey);
  let currentStreak = 0;
  let cursor = practiceDays.has(todayKey) ? todayKey : practiceDays.has(yesterdayKey) ? yesterdayKey : null;
  while (cursor && practiceDays.has(cursor)) {
    currentStreak += 1;
    cursor = previousDayKey(cursor);
  }

  const activeDays = days.filter((day) => day.totalActivities > 0);
  return {
    month, monthLabel, startOffset, daysInMonth, days,
    summary: {
      activeDays: activeDays.length,
      practiceSessions: days.reduce((sum, day) => sum + day.practiceSessions, 0),
      practiceMinutes: days.reduce((sum, day) => sum + day.practiceMinutes, 0),
      vocabularyReviews: days.reduce((sum, day) => sum + day.vocabularyReviews, 0),
      assessments: days.reduce((sum, day) => sum + day.assessments, 0),
    },
    currentStreak, longestStreak,
  };
}
