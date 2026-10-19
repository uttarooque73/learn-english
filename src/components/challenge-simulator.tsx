"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./challenge-simulator.module.css";

const CHALLENGES = [
  { id: "interview", icon: "🎯", category: "CAREER", title: "Ace a job interview", description: "Answer a hiring manager with a clear example.", prompt: "Tell me about a challenging project you worked on and how you handled it.", goal: "Use a clear situation, action, and result. Keep it specific.", seconds: 90 },
  { id: "presentation", icon: "📊", category: "PRESENTING", title: "Present a project", description: "Explain a project update and make the value clear.", prompt: "Your team has delivered a project milestone. Explain what changed, the impact, and what happens next.", goal: "Structure your update: outcome, evidence, next step.", seconds: 90 },
  { id: "salary", icon: "🤝", category: "NEGOTIATION", title: "Negotiate your salary", description: "Make a professional case for better compensation.", prompt: "Your manager says the salary budget is fixed. Respond professionally and explain why an adjustment is justified.", goal: "Be assertive without sounding aggressive; support your request with evidence.", seconds: 120 },
  { id: "discussion", icon: "🧩", category: "WORKPLACE", title: "Handle a difficult discussion", description: "Disagree respectfully and move forward.", prompt: "A colleague blames your team for a delay, but the dependency arrived late. Explain your perspective and suggest a way forward.", goal: "Acknowledge their concern, state facts calmly, and propose a solution.", seconds: 120 },
] as const;

type Challenge = (typeof CHALLENGES)[number];
type Feedback = { correctedSentence: string; explanation: string; issues: { original: string; corrected: string; explanation: string }[]; tips: string[] };
type SavedProgress = { completed: string[]; badges: string[]; bestScores: Record<string, number> };
const STORAGE_KEY = "speakup:challenge-simulator:v1";
const EMPTY_PROGRESS: SavedProgress = { completed: [], badges: [], bestScores: {} };

export function ChallengeSimulator() {
  const [challengeId, setChallengeId] = useState<string>("interview");
  const [answer, setAnswer] = useState("");
  const [remaining, setRemaining] = useState(90);
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<SavedProgress>(EMPTY_PROGRESS);
  const [ready, setReady] = useState(false);
  const [difficulty, setDifficulty] = useState<"warm-up" | "standard" | "stretch">("standard");
  const challenge: Challenge = useMemo(() => CHALLENGES.find((item) => item.id === challengeId) ?? CHALLENGES[0], [challengeId]);
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const score = Math.max(0, Math.min(100, Math.round(Math.min(words, 45) * 1.1 + (answer.match(/[.!?]/g)?.length ?? 0) * 3 + (answer.match(/\b(because|for example|therefore|however|first|next|result|impact|suggest|understand)\b/gi)?.length ?? 0) * 4)));
  const earnedBadge = score >= 75 ? "Clear Communicator" : "Challenge Starter";
  const adaptivePrompt = difficulty === "stretch" ? challenge.prompt + " Add one concrete example and anticipate a likely follow-up question." : difficulty === "warm-up" ? challenge.prompt + " Keep your answer to 2–4 short, clear sentences." : challenge.prompt;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SavedProgress>;
        setProgress({
          completed: Array.isArray(parsed.completed) ? parsed.completed.filter((id): id is string => typeof id === "string") : [],
          badges: Array.isArray(parsed.badges) ? parsed.badges.filter((badge): badge is string => typeof badge === "string") : [],
          bestScores: parsed.bestScores && typeof parsed.bestScores === "object" ? parsed.bestScores as Record<string, number> : {},
        });
      }
    } catch { /* Keep the simulator usable if browser storage is blocked. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!running || submitted) return;
    const timer = window.setInterval(() => setRemaining((value) => {
      if (value <= 1) {
        window.clearInterval(timer);
        setRunning(false);
        return 0;
      }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [running, submitted]);

  function persist(next: SavedProgress) {
    setProgress(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Session state still works. */ }
  }

  function chooseChallenge(id: string) {
    const selected = CHALLENGES.find((item) => item.id === id) ?? CHALLENGES[0];
    setChallengeId(selected.id);
    setAnswer("");
    setRemaining(selected.seconds);
    setRunning(false);
    setSubmitted(false);
    setFeedback(null);
    setError("");
  }

  function startRound() {
    setAnswer("");
    setRemaining(challenge.seconds);
    setSubmitted(false);
    setFeedback(null);
    setError("");
    setRunning(true);
  }

  async function submitAnswer(fromTimer = false) {
    if (submitted || !answer.trim()) {
      if (fromTimer && !answer.trim()) setError("Time is up. Start again when you are ready.");
      return;
    }
    setRunning(false);
    setSubmitted(true);
    setLoadingFeedback(true);
    setError("");
    const nextProgress: SavedProgress = {
      completed: progress.completed.includes(challenge.id) ? progress.completed : [...progress.completed, challenge.id],
      badges: [...new Set([...progress.badges, earnedBadge])],
      bestScores: { ...progress.bestScores, [challenge.id]: Math.max(progress.bestScores[challenge.id] ?? 0, score) },
    };
    persist(nextProgress);
    if (score >= 75) setDifficulty("stretch");
    else if (score < 40) setDifficulty("warm-up");
    else setDifficulty("standard");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learnerMessage: answer.trim(), assistantMessage: "Real-world challenge: " + challenge.title + ". Situation: " + adaptivePrompt + ". Communication goal: " + challenge.goal + ". Give feedback on the learner's English response." }),
      });
      const result = await response.json() as Feedback & { error?: string };
      if (!response.ok) throw new Error(result.error || "AI feedback is temporarily unavailable.");
      setFeedback(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI feedback is temporarily unavailable. Your practice score was saved.");
    } finally {
      setLoadingFeedback(false);
    }
  }

  function replayImproved() {
    if (feedback?.correctedSentence) setAnswer(feedback.correctedSentence);
    setRemaining(challenge.seconds);
    setSubmitted(false);
    setFeedback(null);
    setError("");
    setRunning(true);
  }

  const nextChallenge = CHALLENGES.find((item) => !progress.completed.includes(item.id) && item.id !== challenge.id) ?? CHALLENGES.find((item) => item.id !== challenge.id) ?? CHALLENGES[0];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>PRACTISE FOR THE MOMENTS THAT MATTER</span>
          <h2>Real-world English.<br /><em>Real confidence.</em></h2>
          <p>Step into realistic workplace and career situations. Think on your feet, get supportive feedback, and replay your answer stronger.</p>
          <div className={styles.stats}>
            <div><strong>{ready ? progress.completed.length : "—"}/4</strong><span>Challenges tried</span></div>
            <div><strong>{ready ? progress.badges.length : "—"}</strong><span>Badges earned</span></div>
            <div><strong>{difficulty === "stretch" ? "Stretch" : difficulty === "warm-up" ? "Warm-up" : "Standard"}</strong><span>Suggested level</span></div>
          </div>
        </div>
        <div className={styles.heroIcon} aria-hidden="true">🎤<span>YOUR MOMENT</span></div>
      </section>

      <section className={styles.challengePicker}>
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>CHOOSE YOUR SCENARIO</span><h3>What do you want to get better at?</h3></div><span className={styles.muted}>4 practical challenges</span></div>
        <div className={styles.grid}>
          {CHALLENGES.map((item) => (
            <button key={item.id} type="button" onClick={() => chooseChallenge(item.id)} aria-pressed={challengeId === item.id} className={styles.card + " " + (challengeId === item.id ? styles.selected : "")}>
              <span className={styles.cardIcon}>{item.icon}</span><span className={styles.category}>{item.category}</span><strong>{item.title}</strong><p>{item.description}</p>
              <span className={styles.cardMeta}>{progress.completed.includes(item.id) ? "✓ Best: " + (progress.bestScores[item.id] ?? 0) + "/100" : "Not attempted yet"} <span>↗</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.practice}>
        <div className={styles.practiceHeader}>
          <div><span className={styles.eyebrow}>LIVE SIMULATION</span><h3>{challenge.icon} {challenge.title}</h3></div>
          <div className={styles.timer + (remaining <= 15 ? " " + styles.timerUrgent : "")} aria-live="polite"><span>TIME LEFT</span><strong>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</strong></div>
        </div>
        <div className={styles.progressTrack}><span style={{ width: Math.min(100, ((challenge.seconds - remaining) / challenge.seconds) * 100) + "%" }} /></div>
        <div className={styles.scenario}>
          <span className={styles.sceneLabel}>THE SITUATION · {difficulty.toUpperCase().replace("-", " ")}</span><p>{adaptivePrompt}</p>
          <div className={styles.goal}><strong>Your communication goal</strong><span>{challenge.goal}</span></div>
        </div>
        <label className={styles.answerLabel} htmlFor="challenge-answer">YOUR RESPONSE <span>{words} words</span></label>
        <textarea id="challenge-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={submitted} rows={6} placeholder="Write what you would say in real life. Aim for a clear, confident response…" />
        <div className={styles.actions}>
          {!running && !submitted && <button type="button" className={styles.primary} onClick={() => remaining < challenge.seconds ? setRunning(true) : startRound()}>{remaining < challenge.seconds ? "Resume timer" : "Start timed round"} <span>→</span></button>}
          {running && <button type="button" className={styles.secondary} onClick={() => setRunning(false)}>Pause timer</button>}
          {!submitted && <button type="button" className={styles.primary} disabled={!answer.trim()} onClick={() => void submitAnswer()}>Submit answer <span>↗</span></button>}
          {submitted && <button type="button" className={styles.secondary} onClick={() => chooseChallenge(nextChallenge.id)}>Next challenge →</button>}
        </div>
        {error && <p className={styles.error} role="status">{error}</p>}
        {submitted && <div className={styles.results} aria-live="polite">
          <div className={styles.score}><span>Practice score</span><strong>{score}<small>/100</small></strong><p>{score >= 75 ? "Strong response — try a tougher scenario next." : score >= 40 ? "Good foundation. Make your point more specific and structured." : "A useful first attempt. Add detail and connect your ideas."}</p></div>
          <div className={styles.resultBody}>
            <span className={styles.badge}>🏅 {earnedBadge}</span>
            {loadingFeedback ? <p>Getting your personalised English feedback…</p> : feedback ? <>
              <h4>Make your answer even stronger</h4><p>{feedback.explanation}</p>
              {feedback.correctedSentence && <div className={styles.improved}><strong>Suggested version</strong><p>{feedback.correctedSentence}</p></div>}
              {feedback.issues.length > 0 && <div className={styles.issues}><strong>Corrections to notice</strong>{feedback.issues.slice(0, 3).map((issue, index) => <p key={issue.original + "-" + index}><span>{issue.original}</span> → <b>{issue.corrected}</b><small>{issue.explanation}</small></p>)}</div>}
              {feedback.tips.length > 0 && <ul>{feedback.tips.slice(0, 3).map((tip) => <li key={tip}>{tip}</li>)}</ul>}
            </> : <p>Your attempt and badge are saved. Replay your response to improve clarity, structure, and confidence.</p>}
            <button type="button" className={styles.primary} onClick={replayImproved}>Replay with an improved answer <span>↻</span></button>
          </div>
        </div>}
      </section>

      <section className={styles.badgesSection}>
        <div><span className={styles.eyebrow}>YOUR MILESTONES</span><h3>Badges you have earned</h3></div>
        <div className={styles.badgeList}>{progress.badges.length ? progress.badges.map((badge) => <span key={badge}>🏅 {badge}</span>) : <p>Complete your first challenge to earn a badge. Every attempt counts.</p>}</div>
        <p className={styles.privacy}>Your progress is saved in this browser. Scores are practice guidance, not a formal English proficiency assessment. AI feedback requires your configured Ollama provider.</p>
      </section>
    </div>
  );
}
