"use client";

import { useEffect, useMemo, useState } from "react";

const SPRINT_SECONDS = 60;
const COMPLETIONS_KEY = "speakup-speaking-sprint-completions";
const FAVORITES_KEY = "speakup-speaking-sprint-favorites";

const PROMPTS = [
  { id: "perfect-day", category: "EVERYDAY LIFE", title: "Describe your perfect day.", hint: "Where would you go? Who would you spend it with? What would make it special?" },
  { id: "cook", category: "THINK ON YOUR FEET", title: "Should everyone learn to cook?", hint: "Share your opinion, give two reasons, and include a real-life example." },
  { id: "learned", category: "TELL A STORY", title: "Talk about a time you learned something new.", hint: "What was difficult at first? What helped you improve?" },
  { id: "skill", category: "WORK & CAREER", title: "Explain a skill you want to master.", hint: "Why does it matter to you? How will you practise it?" },
  { id: "anywhere", category: "IMAGINATION", title: "If you could live anywhere for a year, where would you go?", hint: "Describe the place, your daily routine, and what you would discover." },
  { id: "proud", category: "BUILD CONFIDENCE", title: "Talk about something you are proud of.", hint: "Set the scene, explain what you did, and say what it taught you." },
  { id: "team", category: "MAKE YOUR CASE", title: "Is it better to work alone or in a team?", hint: "Choose a side, explain your reasons, and acknowledge the other view." },
  { id: "problem", category: "QUICK STORY", title: "Describe a small problem you solved recently.", hint: "What happened, what options did you consider, and what was the result?" },
];

const CATEGORIES = ["ALL TOPICS", ...Array.from(new Set(PROMPTS.map((prompt) => prompt.category)))];

export function SpeakingSprint() {
  const [promptId, setPromptId] = useState(PROMPTS[0].id);
  const [category, setCategory] = useState("ALL TOPICS");
  const [secondsLeft, setSecondsLeft] = useState(SPRINT_SECONDS);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const filteredPrompts = useMemo(
    () => PROMPTS.filter((item) => category === "ALL TOPICS" || item.category === category),
    [category],
  );
  const prompt = PROMPTS.find((item) => item.id === promptId) ?? PROMPTS[0];
  const isFavorite = favorites.includes(prompt.id);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const saved = Number(window.localStorage.getItem(COMPLETIONS_KEY) ?? 0);
        if (Number.isFinite(saved) && saved >= 0) setCompleted(Math.floor(saved));
        const savedFavorites: unknown = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]");
        if (Array.isArray(savedFavorites)) {
          setFavorites(savedFavorites.filter((id): id is string => typeof id === "string" && PROMPTS.some((item) => item.id === id)));
        }
      } catch {
        // The challenge still works when browser storage is unavailable or malformed.
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timeout = window.setTimeout(() => {
      if (secondsLeft <= 1) {
        setSecondsLeft(0);
        setRunning(false);
        setCompleted((previous) => {
          const next = previous + 1;
          try {
            window.localStorage.setItem(COMPLETIONS_KEY, String(next));
          } catch {
            // Completion is still counted for this session.
          }
          return next;
        });
      } else {
        setSecondsLeft((remaining) => remaining - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [running, secondsLeft]);

  function chooseAnotherPrompt() {
    setRunning(false);
    setSecondsLeft(SPRINT_SECONDS);
    const choices = filteredPrompts.filter((item) => item.id !== prompt.id);
    const pool = choices.length > 0 ? choices : filteredPrompts;
    const next = pool[Math.floor(Math.random() * pool.length)] ?? PROMPTS[0];
    setPromptId(next.id);
  }

  function changeCategory(nextCategory: string) {
    setRunning(false);
    setSecondsLeft(SPRINT_SECONDS);
    setCategory(nextCategory);
    const next = PROMPTS.find((item) => nextCategory === "ALL TOPICS" || item.category === nextCategory) ?? PROMPTS[0];
    setPromptId(next.id);
  }

  function toggleFavorite() {
    setFavorites((current) => {
      const next = current.includes(prompt.id)
        ? current.filter((id) => id !== prompt.id)
        : [...current, prompt.id];
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // Favorites remain available for this session if storage is blocked.
      }
      return next;
    });
  }

  function startOrRestart() {
    if (secondsLeft === 0) setSecondsLeft(SPRINT_SECONDS);
    setRunning(true);
  }

  const progress = ((SPRINT_SECONDS - secondsLeft) / SPRINT_SECONDS) * 100;
  const time = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <section className="speaking-sprint" aria-labelledby="speaking-sprint-title">
      <div className="sprint-main">
        <div className="sprint-eyebrow"><span aria-hidden="true">⚡</span> THE 60-SECOND CHALLENGE</div>
        <div className="sprint-heading-row">
          <div>
            <h2 id="speaking-sprint-title">Find your flow.</h2>
            <p>Speak out loud for one minute. No scripts, no pressure—just keep going.</p>
          </div>
          <div className="sprint-timer" aria-label={`${secondsLeft} seconds remaining`}>
            <strong>{time}</strong>
            <span>{secondsLeft === 0 ? "COMPLETE" : running ? "KEEP GOING" : "YOUR TIME"}</span>
          </div>
        </div>
        <div className="sprint-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <div className="sprint-tools">
          <label className="sprint-filter">Practice topic
            <select aria-label="Filter speaking topics" value={category} onChange={(event) => changeCategory(event.target.value)} disabled={running}>
              {CATEGORIES.map((item) => <option key={item} value={item}>{item === "ALL TOPICS" ? "All topics" : item}</option>)}
            </select>
          </label>
          <button className={`sprint-favorite${isFavorite ? " is-favorite" : ""}`} type="button" onClick={toggleFavorite} aria-pressed={isFavorite}>
            {isFavorite ? "★ Saved prompt" : "☆ Save prompt"}
          </button>
        </div>
        <div className="sprint-prompt">
          <span className="sprint-category">{prompt.category}</span>
          <h3>{secondsLeft === 0 ? "You showed up. That counts." : prompt.title}</h3>
          <p>{secondsLeft === 0 ? "Take a breath. What is one sentence you could say more clearly next time?" : prompt.hint}</p>
        </div>
        <div className="sprint-actions">
          <button className="button button-dark" type="button" onClick={startOrRestart} disabled={running}>
            {secondsLeft === 0 ? "Try again" : running ? "Sprint in progress…" : "Start speaking"} <span aria-hidden="true">→</span>
          </button>
          <button className="sprint-swap" type="button" onClick={chooseAnotherPrompt} disabled={running}>↻ New prompt</button>
          {running && <button className="sprint-swap" type="button" onClick={() => setRunning(false)}>Pause</button>}
        </div>
        <p className="sprint-tip" aria-live="polite">{running ? "Tip: If you get stuck, describe what you can see around you." : "Pro tip: Keep talking—even if you make a mistake. Fluency grows with practice."}</p>
      </div>
      <aside className="sprint-score" aria-label="Your speaking sprint progress">
        <div className="sprint-trophy" aria-hidden="true">✦</div>
        <span className="sprint-score-label">YOUR MOMENTUM</span>
        <strong>{ready ? completed : "—"}</strong>
        <span className="sprint-score-caption">sprints completed</span>
        <div className="sprint-xp"><span aria-hidden="true">✧</span><div><strong>{ready ? completed * 10 : "—"} XP</strong><small>10 XP per sprint</small></div></div>
        <div className="sprint-favorite-count" aria-live="polite">★ {ready ? favorites.length : "—"} saved {favorites.length === 1 ? "prompt" : "prompts"}</div>
        <p>Small reps. Stronger voice.</p>
      </aside>
    </section>
  );
}
