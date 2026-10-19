"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./english-quest.module.css";

const QUESTS = [
  {
    id: "coffee",
    title: "Coffee Shop Confidence",
    emoji: "☕",
    level: "EVERYDAY ENGLISH",
    description: "Order with confidence, make small talk, and handle a surprise.",
    color: "peach",
    rounds: [
      { title: "Place your order", scene: "You walk into a busy café. Order a drink and a snack, and ask how much they cost.", goal: "Use a polite request such as “Could I have…?”", words: ["could", "please", "would"] },
      { title: "Make small talk", scene: "The barista says, “It’s a lovely day, isn’t it?” Keep the conversation going with two sentences.", goal: "Ask one follow-up question.", words: ["weather", "weekend", "plans"] },
      { title: "Handle a mix-up", scene: "Your drink arrives cold, but you asked for it hot. Explain the problem politely.", goal: "Stay polite and suggest a solution.", words: ["actually", "could", "instead"] },
    ],
  },
  {
    id: "work",
    title: "The Workplace Win",
    emoji: "💼",
    level: "WORK & CAREER",
    description: "Share an idea, clarify a deadline, and give a confident update.",
    color: "blue",
    rounds: [
      { title: "Share an idea", scene: "Your team is discussing a project. Suggest one improvement and explain why it helps.", goal: "Use “I’d suggest…” or “One idea would be…”.", words: ["suggest", "because", "benefit"] },
      { title: "Clarify a deadline", scene: "Your manager asks you to finish two tasks by Friday. Ask which task is the priority.", goal: "Ask a clear, professional question.", words: ["priority", "deadline", "confirm"] },
      { title: "Give an update", scene: "A task is delayed by one day. Explain the reason and your next step.", goal: "Be clear, calm, and solution-focused.", words: ["update", "because", "next"] },
    ],
  },
  {
    id: "travel",
    title: "The Travel Plot Twist",
    emoji: "🧭",
    level: "REAL-WORLD ADVENTURE",
    description: "Ask for directions, solve a booking problem, and meet someone new.",
    color: "lavender",
    rounds: [
      { title: "Find your way", scene: "You’re in a new city. Ask a stranger how to get to the nearest train station.", goal: "Ask politely and check you understood.", words: ["excuse", "nearest", "straight"] },
      { title: "Fix a booking", scene: "Your hotel cannot find your reservation. Explain the situation and offer details.", goal: "Explain the problem without getting flustered.", words: ["reservation", "booked", "confirmation"] },
      { title: "Meet someone new", scene: "Someone sitting next to you asks where you’re from. Answer and ask them something too.", goal: "Give an answer and return a question.", words: ["originally", "visiting", "yourself"] },
    ],
  },
] as const;

const STORAGE_KEY = "speakup-english-quest-completions";

type Round = (typeof QUESTS)[number]["rounds"][number];

export function EnglishQuest() {
  const [questId, setQuestId] = useState<string>("coffee");
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [roundScore, setRoundScore] = useState<number | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [completedQuests, setCompletedQuests] = useState(0);
  const [ready, setReady] = useState(false);

  const quest = useMemo(() => QUESTS.find((item) => item.id === questId) ?? QUESTS[0], [questId]);
  const round: Round = quest.rounds[roundIndex];
  const words = useMemo(() => answer.toLowerCase().match(/[a-z']+/g) ?? [], [answer]);
  const usedKeywords = (round.words as readonly string[]).filter((word) => words.includes(word));
  const wordCount = words.length;
  const earnedPoints = Math.min(100, Math.min(50, wordCount * 2) + usedKeywords.length * 10 + (wordCount >= 25 ? 10 : 0));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as { points?: number; completed?: number };
        setTotalPoints(Number.isFinite(saved.points) ? Math.max(0, saved.points ?? 0) : 0);
        setCompletedQuests(Number.isFinite(saved.completed) ? Math.max(0, saved.completed ?? 0) : 0);
      } catch {
        // The quest remains playable when storage is unavailable.
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function chooseQuest(id: string) {
    setQuestId(id);
    setRoundIndex(0);
    setAnswer("");
    setRoundScore(null);
  }

  function saveProgress(points: number, completed: number) {
    setTotalPoints(points);
    setCompletedQuests(completed);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ points, completed }));
    } catch {
      // Progress still counts for this session if storage is unavailable.
    }
  }

  function submitRound() {
    if (roundScore !== null || !answer.trim()) return;
    setRoundScore(earnedPoints);
    const isLastRound = roundIndex === quest.rounds.length - 1;
    if (isLastRound) saveProgress(totalPoints + earnedPoints, completedQuests + 1);
    else setTotalPoints((previous) => previous + earnedPoints);
  }

  function nextRound() {
    if (roundIndex < quest.rounds.length - 1) {
      setRoundIndex((previous) => previous + 1);
      setAnswer("");
      setRoundScore(null);
    } else {
      setRoundIndex(0);
      setAnswer("");
      setRoundScore(null);
    }
  }

  const isLastRound = roundIndex === quest.rounds.length - 1;

  return (
    <div className={styles.quest}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.pill}>✦ PLAY YOUR WAY TO FLUENCY</span>
          <h2>Real life. <em>Real English.</em><br />Your next quest starts here.</h2>
          <p>Beat three real-world speaking challenges. Build better sentences, collect XP, and get a little braver each round.</p>
          <div className={styles.stats}>
            <div><strong>{ready ? totalPoints : "—"}</strong><span>XP earned</span></div>
            <div><strong>{ready ? completedQuests : "—"}</strong><span>Quests completed</span></div>
            <div><strong>3</strong><span>Rounds per quest</span></div>
          </div>
        </div>
        <div className={styles.heroArt} aria-hidden="true"><div className={styles.orbit}></div><span className={styles.star}>✦</span><span className={styles.artEmoji}>🗺️</span><span className={styles.artLabel}>LEVEL UP IRL</span></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><span className={styles.kicker}>CHOOSE YOUR ADVENTURE</span><h3>Where are we going today?</h3></div><span className={styles.smallNote}>Pick a quest to begin</span></div>
        <div className={styles.questGrid}>
          {QUESTS.map((item) => (
            <button key={item.id} type="button" className={`${styles.questCard} ${styles[item.color]} ${questId === item.id ? styles.selected : ""}`} onClick={() => chooseQuest(item.id)} aria-pressed={questId === item.id}>
              <span className={styles.questEmoji}>{item.emoji}</span><span className={styles.questLevel}>{item.level}</span><strong>{item.title}</strong><span className={styles.questDescription}>{item.description}</span><span className={styles.cardFooter}>{questId === item.id ? "CURRENT QUEST ✓" : "START QUEST ↗"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.challenge}>
        <div className={styles.challengeTop}>
          <div><span className={styles.kicker}>YOUR CURRENT MISSION</span><h3>{quest.emoji} {quest.title}</h3></div>
          <span className={styles.roundBadge}>ROUND {roundIndex + 1} / {quest.rounds.length}</span>
        </div>
        <div className={styles.progressTrack} aria-label={`Round ${roundIndex + 1} of ${quest.rounds.length}`}><span style={{ width: `${((roundIndex + 1) / quest.rounds.length) * 100}%` }} /></div>
        <div className={styles.missionLayout}>
          <div className={styles.scene}>
            <span className={styles.sceneIcon}>🎬</span><span className={styles.kicker}>THE SCENE</span><h4>{round.title}</h4><p>{round.scene}</p>
            <div className={styles.goal}><strong>🎯 Your mini-goal</strong><span>{round.goal}</span></div>
            <div className={styles.wordBank}><strong>Try using one of these</strong><div>{round.words.map((word) => <span key={word}>{word}</span>)}</div></div>
          </div>
          <div className={styles.answerPanel}>
            <label htmlFor="quest-answer">YOUR RESPONSE <span>{wordCount} words</span></label>
            <textarea id="quest-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write what you would say in this situation… Try to sound natural, not perfect." disabled={roundScore !== null} rows={7} />
            <div className={styles.answerHint}>Aim for 25+ words and try to use a phrase from the word bank.</div>
            {roundScore === null ? (
              <button className={styles.primaryButton} type="button" disabled={!answer.trim()} onClick={submitRound}>Complete this round <span>↗</span></button>
            ) : (
              <div className={styles.feedback} role="status">
                <span className={styles.feedbackIcon}>{roundScore >= 60 ? "✨" : "🌱"}</span><div><strong>{roundScore >= 60 ? "Nice work — you’re building momentum!" : "Good start. Keep stretching your sentences!"}</strong><p>You earned <b>+{roundScore} XP</b>. {wordCount < 25 ? "Try adding a little more detail next round." : "You gave yourself room to express the full idea."} {usedKeywords.length > 0 ? `You used ${usedKeywords.length} word-bank ${usedKeywords.length === 1 ? "word" : "words"}.` : "Try weaving in a word from the word bank next time."}</p></div>
                <button className={styles.primaryButton} type="button" onClick={nextRound}>{isLastRound ? "Play this quest again" : "Next round"} <span>→</span></button>
              </div>
            )}
          </div>
        </div>
        <p className={styles.privacyNote}>🔒 Your answers stay in this browser. XP is a playful practice score, not a formal language assessment.</p>
      </section>
    </div>
  );
}
