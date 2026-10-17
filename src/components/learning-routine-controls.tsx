"use client";

import { useEffect, useState, type FormEvent } from "react";

type Schedule = { timezone: string; dailyTargetMinutes: number; scheduleEnabled: boolean; goals: string[] };
type Policy = { enabled: boolean; policyVersion: string; reviewIntervalScale: number };

export function LearningRoutineControls() {
  const [schedule, setSchedule] = useState<Schedule>({ timezone: "Asia/Kolkata", dailyTargetMinutes: 20, scheduleEnabled: false, goals: [] });
  const [policy, setPolicy] = useState<Policy>({ enabled: true, policyVersion: "evidence-v1", reviewIntervalScale: 1 });
  const [goal, setGoal] = useState("Improve everyday English communication");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/learning/schedule", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json() as { schedule?: Schedule; error?: string };
        if (!response.ok || !payload.schedule) throw new Error(payload.error || "Could not load schedule settings.");
        return payload.schedule;
      }),
      fetch("/api/learning/adaptation", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json() as { policy?: Policy; error?: string };
        if (!response.ok || !payload.policy) throw new Error(payload.error || "Could not load adaptation settings.");
        return payload.policy;
      }),
    ]).then(([nextSchedule, nextPolicy]) => {
      if (!active) return;
      setSchedule(nextSchedule);
      setPolicy(nextPolicy);
      if (nextSchedule.goals[0]) setGoal(nextSchedule.goals[0]);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load your learning routine.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const scheduleResponse = await fetch("/api/learning/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleEnabled: schedule.scheduleEnabled, timezone: schedule.timezone, dailyTargetMinutes: schedule.dailyTargetMinutes, goal }),
      });
      const schedulePayload = await scheduleResponse.json() as { schedule?: Schedule; error?: string };
      if (!scheduleResponse.ok || !schedulePayload.schedule) throw new Error(schedulePayload.error || "Could not save your schedule.");
      const policyResponse = await fetch("/api/learning/adaptation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adaptationEnabled: policy.enabled, reviewIntervalScale: policy.reviewIntervalScale }),
      });
      const policyPayload = await policyResponse.json() as { policy?: Policy; error?: string };
      if (!policyResponse.ok || !policyPayload.policy) throw new Error(policyPayload.error || "Could not save adaptation settings.");
      setSchedule(schedulePayload.schedule);
      setPolicy(policyPayload.policy);
      setMessage("Your learning routine was saved to the database.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your learning routine.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="settings-card" aria-live="polite"><p>Loading your saved learning routine…</p></section>;

  return (
    <form className="learning-settings" onSubmit={save}>
      <section className="settings-card" aria-labelledby="routine-controls-heading">
        <div className="settings-card-heading"><span className="settings-symbol" aria-hidden="true">◷</span><div><h2 id="routine-controls-heading">Adaptive daily routine</h2><p>These controls are saved in the application database and used by the scheduled planner.</p></div></div>
        <div className="settings-field-grid">
          <label className="settings-field">Daily target
            <select value={schedule.dailyTargetMinutes} onChange={(event) => setSchedule(current => ({ ...current, dailyTargetMinutes: Number(event.target.value) }))}>
              {[5, 10, 15, 20, 25, 30, 45, 60].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
          </label>
          <label className="settings-field">Time zone
            <select value={schedule.timezone} onChange={(event) => setSchedule(current => ({ ...current, timezone: event.target.value }))}>
              {["Asia/Kolkata", "UTC", "America/New_York", "Europe/London", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"].map(zone => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <label className="settings-field">Learning goal
            <input value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={500} required />
          </label>
          <label className="settings-field">Spaced-review interval
            <select value={policy.reviewIntervalScale} onChange={(event) => setPolicy(current => ({ ...current, reviewIntervalScale: Number(event.target.value) }))}>
              <option value={0.5}>More frequent reviews</option><option value={0.75}>Somewhat more frequent</option><option value={1}>Balanced (recommended)</option><option value={1.25}>Less frequent</option><option value={1.5}>Much less frequent</option><option value={2}>Minimum review frequency</option>
            </select>
          </label>
        </div>
        <label className="settings-topic"><input type="checkbox" checked={schedule.scheduleEnabled} onChange={(event) => setSchedule(current => ({ ...current, scheduleEnabled: event.target.checked }))} /> Enable automatically scheduled daily plans</label>
        <label className="settings-topic"><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy(current => ({ ...current, enabled: event.target.checked }))} /> Adapt activity priorities using saved practice evidence</label>
        <p className="section-note">Pausing scheduled plans does not disable manual plan generation or practice. Adaptation changes recommendations, not whether an activity is marked complete.</p>
        <div className="review-actions"><button type="submit" disabled={saving || !goal.trim()}>{saving ? "Saving…" : "Save learning routine"}</button></div>
        {message && <p className="feature-feedback" role="status">{message}</p>}
        {error && <p className="feature-feedback" role="alert">{error}</p>}
      </section>
    </form>
  );
}
