"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./english-proficiency-assessment.module.css";
import { submitLearningEvidence } from "@/lib/learning-evidence-client";

type Question = { id: number; skill: "Grammar" | "Vocabulary" | "Reading"; prompt: string; options: string[]; answer: number; explanation: string };
type Answer = { questionId: number; selected: number };
type Phase = "intro" | "quiz" | "writing" | "results";

const QUESTIONS: Question[] = [
  { id: 1, skill: "Grammar", prompt: "Yesterday, I ___ to the office early.", options: ["go", "went", "have go", "going"], answer: 1, explanation: "Use the past simple, “went”, for a completed action yesterday." },
  { id: 2, skill: "Vocabulary", prompt: "What does “reliable” mean?", options: ["Easy to forget", "Usually late", "Able to be trusted", "Very expensive"], answer: 2, explanation: "A reliable person or thing can be trusted to work or behave well." },
  { id: 3, skill: "Grammar", prompt: "Choose the most natural sentence.", options: ["She work here since 2022.", "She has worked here since 2022.", "She is work here since 2022.", "She working here since 2022."], answer: 1, explanation: "Use the present perfect with “since” for an action that began in the past and continues now." },
  { id: 4, skill: "Reading", prompt: "“Although the meeting ran late, the team finished every agenda item.” What happened?", options: ["The meeting was cancelled.", "The team left before finishing.", "The meeting ran late, but everything was covered.", "The agenda was never discussed."], answer: 2, explanation: "“Although” signals contrast: the meeting ran late, but the team still completed the agenda." },
  { id: 5, skill: "Vocabulary", prompt: "In a work conversation, “Could you clarify that?” means:", options: ["Could you explain it more clearly?", "Could you cancel it?", "Could you agree immediately?", "Could you make it shorter without explaining?"], answer: 0, explanation: "To clarify something is to make it easier to understand." },
  { id: 6, skill: "Grammar", prompt: "If I ___ more time, I would practise every day.", options: ["have", "will have", "had", "am having"], answer: 2, explanation: "The second conditional uses “if + past simple” for an imagined situation." },
  { id: 7, skill: "Reading", prompt: "A message says: “Please send the draft by noon so I can review it before the client call.” When is the deadline?", options: ["After the client call", "By 12:00", "At the end of the week", "Whenever it is ready"], answer: 1, explanation: "“By noon” means no later than 12:00." },
  { id: 8, skill: "Vocabulary", prompt: "Which phrase is best for politely disagreeing in a meeting?", options: ["You are completely wrong.", "That makes no sense.", "I see your point, though I have a different view.", "No. Stop talking."], answer: 2, explanation: "Acknowledge the other person's point, then state your view respectfully." },
];

const SKILLS = ["Grammar", "Vocabulary", "Reading"] as const;
function levelFor(score: number) {
  if (score >= 88) return { level: "Advanced", description: "You handle these English tasks confidently. Focus next on nuance, precision, and complex real-world communication." };
  if (score >= 63) return { level: "Intermediate", description: "You have a useful foundation. Target recurring grammar patterns and practise explaining ideas in fuller sentences." };
  return { level: "Beginner", description: "Build confidence with everyday sentence patterns, core vocabulary, and short reading tasks. Consistent practice will help." };
}

export function EnglishProficiencyAssessment() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [writing, setWriting] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const score = Math.round((answers.filter((answer) => QUESTIONS.find((question) => question.id === answer.questionId)?.answer === answer.selected).length / QUESTIONS.length) * 100);
  const assessment = levelFor(score);
  const current = QUESTIONS[index];
  const selected = answers.find((answer) => answer.questionId === current?.id)?.selected;
  const skillScores = SKILLS.map((skill) => {
    const questions = QUESTIONS.filter((question) => question.skill === skill);
    const correct = answers.filter((answer) => questions.some((question) => question.id === answer.questionId && question.answer === answer.selected)).length;
    return { skill, correct, total: questions.length, percent: Math.round((correct / questions.length) * 100) };
  });

  function chooseAnswer(option: number) {
    if (!current) return;
    setAnswers((existing) => [...existing.filter((answer) => answer.questionId !== current.id), { questionId: current.id, selected: option }]);
  }

  function nextQuestion() {
    if (selected === undefined) return;
    if (index === QUESTIONS.length - 1) setPhase("writing");
    else setIndex((value) => value + 1);
  }

  async function requestFeedback() {
    setFeedbackLoading(true);
    setFeedbackError("");
    try {
      const answerSummary = QUESTIONS.map((question) => {
        const answer = answers.find((item) => item.questionId === question.id);
        return `[${question.skill}] ${question.prompt}\nLearner answer: ${answer ? question.options[answer.selected] : "Not answered"}\nCorrect answer: ${question.options[question.answer]}\nExplanation: ${question.explanation}`;
      }).join("\n\n");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "tutor",
          difficulty: assessment.level,
          sessionGoal: "Improve fluency",
          feedbackStyle: "balanced",
          messages: [{ role: "user", content: `Give me an English proficiency assessment report. Treat this as an assessment, not a conversation. My objective quiz score is ${score}% and the estimated practice level is ${assessment.level}.\n\nQuiz answers:\n${answerSummary}\n\nWriting sample prompt: “Describe a challenge you solved and what you learned from it.”\nLearner writing sample:\n${writing.trim() || "(No writing sample provided)"}\n\nReturn a concise, supportive report with: (1) what I did well, (2) two specific areas to improve based on the evidence, (3) a corrected natural version of my writing if provided, and (4) a 3-step practice plan. Be honest that this is an informal practice estimate, not an official CEFR exam. Use clear headings and concrete examples.` }],
        }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Your assessment report could not be generated. Please try again.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
        setFeedback(result);
      }
      result += decoder.decode();
      const finalFeedback = result.trim() || "Your score is ready. Review the skill breakdown and begin with the recommended practice.";
      setFeedback(finalFeedback);

      // Persist objective assessment scores through the existing, owner-scoped evidence pipeline.
      // Reading remains visible in this assessment but is not mapped to a different skill.
      const assessmentEvidence = skillScores
        .filter((item) => item.skill === "Grammar" || item.skill === "Vocabulary")
        .map((item) => submitLearningEvidence({
          source: item.skill === "Vocabulary" ? "vocabulary" : "micro_lesson",
          activityType: item.skill.toLowerCase() as "grammar" | "vocabulary",
          activityRef: \`english-proficiency-assessment:\${item.skill.toLowerCase()}\`,
          skillKey: item.skill.toLowerCase(),
          responseText: \`Assessment score: \${item.percent}%. Correct: \${item.correct}/\${item.total}. Overall level: \${assessment.level}.\`,
          durationSeconds: 0,
          idempotencyKey: crypto.randomUUID(),
          score: item.percent / 100,
          confidence: 0.6,
          feedback: finalFeedback.slice(0, 1200),
        }));
      await Promise.allSettled(assessmentEvidence);
      setPhase("results");
    } catch (cause) {
      setFeedbackError(cause instanceof Error ? cause.message : "Could not generate your report. Please try again.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  function restart() {
    setPhase("intro"); setIndex(0); setAnswers([]); setWriting(""); setFeedback(""); setFeedbackError("");
  }

  return (
    <div className={styles.layout}>
      {phase === "intro" && <section className={styles.hero}>
        <div className={styles.heroCopy}><span className={styles.eyebrow}>YOUR STARTING POINT</span><h2>Find out what to practise next.</h2><p>Answer eight short questions, write a few sentences, and get a personalised report from your AI tutor.</p>
          <div className={styles.facts}><span>◷ About 5 minutes</span><span>✓ Grammar, vocabulary & reading</span><span>✦ Personalised next steps</span></div>
          <button className={styles.primary} type="button" onClick={() => setPhase("quiz")}>Start assessment <span aria-hidden="true">→</span></button>
        </div>
        <div className={styles.preview} aria-label="Assessment overview"><div className={styles.previewIcon}>✦</div><strong>Not a pass or fail test.</strong><p>This is a friendly baseline to help you learn more effectively.</p><div className={styles.previewBars}><span /><span /><span /><span /><span /></div><small>YOUR PROGRESS STARTS HERE</small></div>
      </section>}

      {phase === "quiz" && current && <section className={styles.quiz} aria-labelledby="question-title">
        <div className={styles.quizTop}><span className={styles.eyebrow}>{current.skill.toUpperCase()} CHECK</span><span className={styles.counter}>Question {index + 1} of {QUESTIONS.length}</span></div>
        <div className={styles.progressTrack} aria-label={`${Math.round((index / QUESTIONS.length) * 100)}% complete`}><span style={{ width: `${(index / QUESTIONS.length) * 100}%` }} /></div>
        <h2 id="question-title">{current.prompt}</h2>
        <div className={styles.options} role="group" aria-label="Answer options">{current.options.map((option, optionIndex) => <button key={option} type="button" className={selected === optionIndex ? styles.selected : ""} aria-pressed={selected === optionIndex} onClick={() => chooseAnswer(optionIndex)}><span className={styles.optionLetter}>{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span></button>)}</div>
        <div className={styles.quizFooter}><button type="button" className={styles.secondary} onClick={() => setPhase("intro")}>Exit assessment</button><button type="button" className={styles.primary} disabled={selected === undefined} onClick={nextQuestion}>{index === QUESTIONS.length - 1 ? "Continue to writing" : "Next question"} <span aria-hidden="true">→</span></button></div>
      </section>}

      {phase === "writing" && <section className={styles.writing}><span className={styles.eyebrow}>SHORT WRITING SAMPLE</span><h2>Tell us how you express an idea.</h2><p>In 2–5 sentences, describe a challenge you solved and what you learned from it. Don&apos;t worry about making it perfect.</p><label htmlFor="assessment-writing">Your answer <span>Optional · up to 1,000 characters</span></label><textarea id="assessment-writing" maxLength={1000} rows={6} value={writing} onChange={(event) => setWriting(event.target.value)} placeholder="One challenge I faced was…"/><div className={styles.writingFooter}><span>{writing.length}/1000 characters</span><button type="button" className={styles.primary} disabled={feedbackLoading} onClick={() => void requestFeedback()}>{feedbackLoading ? "Preparing your report…" : "Generate my report"} <span aria-hidden="true">→</span></button></div>{feedbackError && <p role="alert" className={styles.error}>{feedbackError} <button type="button" onClick={() => void requestFeedback()}>Try again</button></p>}</section>}

      {phase === "results" && <section className={styles.results}>
        <div className={styles.resultHero}><div><span className={styles.eyebrow}>YOUR BASELINE</span><h2>Your practice level: <em>{assessment.level}</em></h2><p>{assessment.description}</p></div><div className={styles.score}><strong>{score}%</strong><span>quiz score</span></div></div>
        <div className={styles.skillGrid}>{skillScores.map((item) => <article key={item.skill} className={styles.skillCard}><span>{item.skill}</span><strong>{item.percent}%</strong><div className={styles.progressTrack}><span style={{ width: `${item.percent}%` }}/></div><small>{item.correct} of {item.total} correct</small></article>)}</div>
        <article className={styles.report}><span className={styles.eyebrow}>YOUR AI TUTOR&apos;S FEEDBACK</span>{feedback.split(/\n+/).filter(Boolean).map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}</article>
        <div className={styles.resultActions}><button type="button" className={styles.secondary} onClick={restart}>Retake assessment</button><Link className={styles.primaryLink} href="/ai-tutor">Practise with your AI tutor <span aria-hidden="true">→</span></Link><Link className={styles.secondaryLink} href="/learning-plan">View learning plan</Link></div>
      </section>}
    </div>
  );
}
