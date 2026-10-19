"use client";

import { useState } from "react";

type ActivityType = "conversation" | "vocabulary" | "grammar" | "pronunciation" | "listening" | "fluency" | "real-world-challenge";
type GeneratedActivity = {
  activityType: ActivityType;
  title: string;
  objective: string;
  instructions: string;
  tip: string;
  items: Array<{ prompt: string; expectedAnswer: string; explanation: string; options: string[]; example: string }>;
};

const ACTIVITY_OPTIONS: Array<{ value: ActivityType; label: string }> = [
  { value: "conversation", label: "Conversation practice" },
  { value: "vocabulary", label: "Vocabulary exercises" },
  { value: "grammar", label: "Grammar lesson and exercises" },
  { value: "pronunciation", label: "Pronunciation sentences" },
  { value: "listening", label: "Listening comprehension" },
  { value: "fluency", label: "Speaking fluency" },
  { value: "real-world-challenge", label: "Real-world role-play challenge" },
];

export function DynamicLearningStudio() {
  const [activityType, setActivityType] = useState<ActivityType>("grammar");
  const [topic, setTopic] = useState("articles: a, an, and the");
  const [goal, setGoal] = useState("Use English more naturally and confidently");
  const [level, setLevel] = useState("beginner");
  const [quantity, setQuantity] = useState(5);
  const [activity, setActivity] = useState<GeneratedActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/learning/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityType, topic, goal, proficiencyLevel: level, quantity }),
      });
      const payload = await response.json() as { activity?: GeneratedActivity; error?: string };
      if (!response.ok || !payload.activity) throw new Error(payload.error || "Could not generate practice content.");
      setActivity(payload.activity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate practice content.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section-block" aria-labelledby="dynamic-learning-studio-heading">
      <div className="section-heading">
        <div><p className="eyebrow">PERSONALIZED AI PRACTICE</p><h2 id="dynamic-learning-studio-heading">Generate fresh learning content</h2></div>
      </div>
      <p>Generate new exercises for any learning skill using your goal, level, and topic. Content is created when you request it, not selected from a fixed question bank.</p>
      <form className="next-step-card" onSubmit={generate}>
        <div className="dynamic-learning-fields">
          <label>Practice type
            <select value={activityType} onChange={event => setActivityType(event.target.value as ActivityType)}>
              {ACTIVITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>English level
            <select value={level} onChange={event => setLevel(event.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="elementary">Elementary</option>
              <option value="pre-intermediate">Pre-intermediate</option>
              <option value="intermediate">Intermediate</option>
              <option value="upper-intermediate">Upper-intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label>Topic or skill
            <input value={topic} onChange={event => setTopic(event.target.value)} maxLength={160} required placeholder="e.g. past simple, job interviews" />
          </label>
          <label>Learning goal
            <input value={goal} onChange={event => setGoal(event.target.value)} maxLength={350} required placeholder="What do you want to improve?" />
          </label>
          <label>Number of exercises
            <select value={quantity} onChange={event => setQuantity(Number(event.target.value))}>
              {[3, 5, 8, 10].map(count => <option key={count} value={count}>{count} exercises</option>)}
            </select>
          </label>
          <button type="submit" disabled={loading || !topic.trim() || !goal.trim()}>{loading ? "Generating with AI…" : "Generate practice"}</button>
        </div>
      </form>
      {error && <p className="feature-feedback" role="alert">{error}</p>}
      {activity && <div className="generated-practice" aria-live="polite">
        <h3>{activity.title}</h3>
        <p>{activity.objective}</p>
        <p>{activity.instructions}</p>
        {activity.items.map((item, index) => <details key={`${activity.activityType}-${index}-${item.prompt}`}>
          <summary>{index + 1}. {item.prompt}</summary>
          {item.example && <p><strong>Example or passage:</strong> {item.example}</p>}
          {item.options.length > 0 && <ul>{item.options.map((option, optionIndex) => <li key={optionIndex}>{option}</li>)}</ul>}
          <p><strong>Suggested answer:</strong> {item.expectedAnswer}</p>
          <p><strong>Explanation:</strong> {item.explanation}</p>
        </details>)}
        <p className="section-note">{activity.tip}</p>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(activity.items.map((item, index) => `${index + 1}. ${item.prompt}\nSuggested answer: ${item.expectedAnswer}\nExplanation: ${item.explanation}`).join("\n\n"))}>Copy exercises</button>
      </div>}
    </section>
  );
}
