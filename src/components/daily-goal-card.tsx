"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSessions } from "@/lib/learning-storage";
import { DEFAULT_LEARNING_PREFERENCES, getLearningPreferences } from "@/lib/learning-preferences";

export function DailyGoalCard() {
  const [goalMinutes, setGoalMinutes] = useState(DEFAULT_LEARNING_PREFERENCES.dailyGoalMinutes);
  const [todaySeconds, setTodaySeconds] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const today = new Date().toDateString();
      const sessions = getSessions();
      setTodaySeconds(sessions.reduce((total, session) => {
        return new Date(session.startedAt).toDateString() === today
          ? total + Math.max(0, session.durationSeconds)
          : total;
      }, 0));
      setGoalMinutes(getLearningPreferences().dailyGoalMinutes);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const goalSeconds = goalMinutes * 60;
  const progress = Math.min(100, Math.round((todaySeconds / goalSeconds) * 100));
  const minutes = todaySeconds > 0 ? Math.max(1, Math.round(todaySeconds / 60)) : 0;

  return (
    <section className="daily-goal-card" aria-labelledby="daily-goal-heading">
      <div className="daily-goal-copy">
        <p className="eyebrow">YOUR DAILY PRACTICE</p>
        <h2 id="daily-goal-heading">A little, often, adds up.</h2>
        <p>Practice time from conversations started today, saved on this device.</p>
        <Link href="/settings" className="text-link">Adjust your goal <span aria-hidden="true">→</span></Link>
      </div>
      <div className="daily-goal-progress">
        <div className="daily-goal-numbers"><strong>{minutes}</strong><span>of {goalMinutes} min</span></div>
        <div className="daily-goal-track" role="progressbar" aria-label="Daily practice goal" aria-valuemin={0} aria-valuemax={goalMinutes} aria-valuenow={Math.min(goalMinutes, minutes)}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>{progress >= 100 ? "Daily goal reached — nice work!" : `${goalMinutes - Math.min(goalMinutes, minutes)} minutes to your goal`}</p>
      </div>
    </section>
  );
}
