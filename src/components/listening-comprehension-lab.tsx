"use client";

import { useEffect, useMemo, useState } from "react";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import { upsertSession, type PracticeSession } from "@/lib/learning-storage";
import { speakText, stopSpeaking } from "@/lib/speech-playback";
import styles from "./listening-comprehension-lab.module.css";

type Question = { prompt: string; options: string[]; answer: number; explanation: string };
type Lesson = { id: string; title: string; category: string; level: "Beginner" | "Intermediate" | "Advanced"; duration: string; passage: string; questions: Question[]; focus: string };

const LESSONS: Lesson[] = [
  {
    id: "office-update", title: "A change to the team meeting", category: "Workplace", level: "Beginner", duration: "45 sec",
    passage: "Good morning, everyone. Today’s team meeting has moved from ten o’clock to half past ten because the design team needs a little more time. Please bring your project updates and any questions. We will meet in the small conference room on the second floor. Thank you.",
    focus: "Listen for times, reasons, and locations.",
    questions: [
      { prompt: "What time will the meeting start?", options: ["10:00", "10:30", "11:30"], answer: 1, explanation: "The speaker says the meeting moved to half past ten, which is 10:30." },
      { prompt: "Why was the meeting moved?", options: ["The room is closed", "The manager is late", "The design team needs more time"], answer: 2, explanation: "The design team needs a little more time." },
      { prompt: "Where will everyone meet?", options: ["On the first floor", "In the small conference room on the second floor", "Online"], answer: 1, explanation: "The announcement names the small conference room on the second floor." },
    ],
  },
  {
    id: "cafe-order", title: "Ordering at a café", category: "Everyday life", level: "Beginner", duration: "40 sec",
    passage: "Hi there. Could I have a medium cappuccino with oat milk, please? And can I get a cheese sandwich to take away? I’m in a bit of a hurry, so I’ll pay by card. Oh, and no sugar in the coffee, thanks.",
    focus: "Catch specific details and polite requests.",
    questions: [
      { prompt: "What size coffee does the customer order?", options: ["Small", "Medium", "Large"], answer: 1, explanation: "The customer asks for a medium cappuccino." },
      { prompt: "What milk does the customer request?", options: ["Whole milk", "Almond milk", "Oat milk"], answer: 2, explanation: "The order specifically asks for oat milk." },
      { prompt: "How will the customer pay?", options: ["By card", "With cash", "Using an app"], answer: 0, explanation: "The customer says, “I’ll pay by card.”" },
    ],
  },
  {
    id: "project-delay", title: "Explaining a project delay", category: "Workplace", level: "Intermediate", duration: "60 sec",
    passage: "I wanted to give you a quick update on the mobile release. Most of the development work is complete, but our testing team found an issue with account sign-in on older devices. Rather than ship something unreliable, we’re fixing the problem now. We expect to share a revised launch date by Thursday afternoon. In the meantime, the design review can go ahead as planned.",
    focus: "Identify the main point, cause, and next action.",
    questions: [
      { prompt: "What is causing the delay?", options: ["The design review is unfinished", "A sign-in issue on older devices", "The team has not started development"], answer: 1, explanation: "Testing found an account sign-in issue on older devices." },
      { prompt: "Why is the team not releasing immediately?", options: ["They want to avoid shipping an unreliable product", "The client cancelled the project", "They need new designs"], answer: 0, explanation: "The speaker says they are fixing the issue rather than shipping something unreliable." },
      { prompt: "When will a revised launch date be shared?", options: ["Tuesday morning", "Thursday afternoon", "Next month"], answer: 1, explanation: "The speaker expects to share the revised date by Thursday afternoon." },
    ],
  },
  {
    id: "train-announcement", title: "A station announcement", category: "Travel", level: "Advanced", duration: "55 sec",
    passage: "Passengers travelling on the 6:15 service to Central Station should note that the train will depart from platform four instead of platform two. The service is running approximately eight minutes behind schedule. Passengers connecting to the airport express are advised to use the footbridge and allow extra time for the transfer. We apologise for any inconvenience and thank you for your patience.",
    focus: "Follow several instructions in one announcement.",
    questions: [
      { prompt: "What has changed about the 6:15 service?", options: ["Its destination", "Its platform", "Its ticket price"], answer: 1, explanation: "The train will leave from platform four instead of platform two." },
      { prompt: "How late is the service expected to be?", options: ["About eight minutes", "About eighteen minutes", "One hour"], answer: 0, explanation: "The announcement says approximately eight minutes behind schedule." },
      { prompt: "What should airport express passengers do?", options: ["Wait on platform two", "Ask for a refund", "Use the footbridge and allow extra transfer time"], answer: 2, explanation: "They are advised to use the footbridge and allow extra time." },
    ],
  },
];

function makeSessionId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `listening-${Date.now()}`;
}

export function ListeningComprehensionLab() {
  const [lessonId, setLessonId] = useState(LESSONS[0].id);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState(false);
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [notice, setNotice] = useState("");
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  const [replayCount, setReplayCount] = useState(0);
  const [sessionId] = useState(makeSessionId);
  const [startedAt] = useState(() => new Date().toISOString());
  const lesson = useMemo(() => LESSONS.find((item) => item.id === lessonId) ?? LESSONS[0], [lessonId]);
  const score = lesson.questions.reduce((total, question, index) => total + (answers[String(index)] === question.answer ? 1 : 0), 0);
  const allAnswered = lesson.questions.every((_, index) => answers[String(index)] !== undefined);

  useEffect(() => {
    void initializeDatabasePersistence().catch(() => undefined);
    return () => { stopSpeaking(); };
  }, []);

  function selectLesson(id: string) {
    stopSpeaking();
    setLessonId(id);
    setAnswers({});
    setChecked(false);
    setTranscriptVisible(false);
    setNotice("");
    setReplayCount(0);
  }

  function playPassage() {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setNotice("Audio playback is not supported in this browser. You can reveal the passage and read it instead.");
      return;
    }
    const started = speakText(
      lesson.passage,
      () => setNotice("Playback complete. Answer the questions or replay at a slower pace."),
      replayCount > 0 ? 0.88 : undefined,
      () => setNotice("Playing passage. Listen for the key details before answering."),
      () => setNotice("Playback stopped. Try replaying, or reveal the transcript."),
    );
    if (!started) {
      setNotice("Audio playback could not start. Check your browser's speech settings and try again.");
      return;
    }
    setReplayCount((count) => count + 1);
  }

  function checkAnswers() {
    if (!allAnswered) return;
    setChecked(true);
    setNotice(`You scored ${score} out of ${lesson.questions.length}. Review each explanation, then replay to strengthen your listening.`);
    const messages = lesson.questions.map((question, index) => ({
      role: "user" as const,
      content: `Q: ${question.prompt}\nYour answer: ${question.options[answers[String(index)]]}\nCorrect answer: ${question.options[question.answer]}\nResult: ${answers[String(index)] === question.answer ? "correct" : "needs review"}`,
    }));
    const session: PracticeSession = {
      id: sessionId,
      scenario: `Listening lab: ${lesson.title}`,
      goal: "Improve listening comprehension and detail recognition",
      startedAt,
      updatedAt: new Date().toISOString(),
      durationSeconds: 0,
      messageCount: messages.length,
      learnerMessages: messages.map((message) => message.content),
      messages,
    };
    try { upsertSession(session); } catch { setNotice("Your score is ready, but this attempt could not be saved on this device."); }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>LISTEN · UNDERSTAND · REPLAY</span><h2>Hear the details.<br /><em>Build real confidence.</em></h2><p>Short everyday and workplace passages help you practise understanding spoken English, not just reading it. Listen first, answer from memory, then review the transcript and explanations.</p></div>
        <div className={styles.heroBadge} aria-hidden="true"><span>LISTENING</span><strong>耳</strong><small>COMPREHENSION</small></div>
      </section>

      <section className={styles.lessonSection} aria-labelledby="choose-lesson">
        <div className={styles.sectionHeader}><div><span className={styles.kicker}>YOUR PRACTICE</span><h3 id="choose-lesson">Choose a listening exercise</h3></div><span className={styles.count}>{LESSONS.length} exercises</span></div>
        <div className={styles.lessonGrid}>
          {LESSONS.map((item, index) => (
            <button key={item.id} type="button" className={`${styles.lessonCard} ${lesson.id === item.id ? styles.selected : ""}`} aria-pressed={lesson.id === item.id} onClick={() => selectLesson(item.id)}>
              <span className={styles.lessonNumber}>0{index + 1}</span><span className={styles.lessonCategory}>{item.category}</span><strong>{item.title}</strong><span className={styles.lessonMeta}>{item.level} · {item.duration}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.practice} aria-labelledby="active-lesson">
        <div className={styles.sectionHeader}><div><span className={styles.kicker}>{lesson.category.toUpperCase()} · {lesson.level.toUpperCase()}</span><h3 id="active-lesson">{lesson.title}</h3><p>{lesson.focus}</p></div><span className={styles.duration}>{lesson.duration}</span></div>
        <div className={styles.audioPanel}>
          <div className={styles.audioArt} aria-hidden="true"><span>♫</span><div><i /><i /><i /><i /><i /><i /><i /></div></div>
          <div className={styles.audioCopy}><strong>Listen before you read</strong><p>{speechSupported ? "Listen to the spoken passage. Replay as often as you need; the second play is slightly slower." : "Your browser may not support spoken playback. You can still practise using the transcript."}</p></div>
          <button type="button" className={styles.primary} onClick={playPassage}>▶ {replayCount ? "Replay passage" : "Play passage"}</button>
        </div>
        <p className={styles.notice} role="status" aria-live="polite">{notice || "Tip: listen for names, times, reasons, and what happens next."}</p>
        <div className={styles.questions}>
          <div className={styles.questionsHeader}><h4>Check your understanding</h4><span>{Object.keys(answers).length}/{lesson.questions.length} answered</span></div>
          {lesson.questions.map((question, index) => {
            const selected = answers[String(index)];
            const correct = selected === question.answer;
            return <fieldset className={styles.question} key={question.prompt} disabled={checked}>
              <legend><span>0{index + 1}</span>{question.prompt}</legend>
              <div className={styles.options}>{question.options.map((option, optionIndex) => (
                <label key={option}><input type="radio" name={`${lesson.id}-question-${index}`} value={optionIndex} checked={selected === optionIndex} onChange={() => setAnswers((current) => ({ ...current, [String(index)]: optionIndex }))} /> <span>{option}</span></label>
              ))}</div>
              {checked && <div className={`${styles.explanation} ${correct ? styles.correct : styles.incorrect}`}><strong>{correct ? "Correct" : `Answer: ${question.options[question.answer]}`}</strong><p>{question.explanation}</p></div>}
            </fieldset>;
          })}
        </div>
        {!checked ? <button type="button" className={styles.primary} disabled={!allAnswered} onClick={checkAnswers}>Check answers <span aria-hidden="true">→</span></button> : <div className={styles.results} role="status"><div><span className={styles.kicker}>YOUR RESULT</span><strong>{score}/{lesson.questions.length}</strong><p>{score === lesson.questions.length ? "Excellent listening. You caught every key detail." : score >= 2 ? "Good work. Review the explanations and listen once more." : "Keep going. Reveal the transcript, then replay and try again."}</p></div><button type="button" className={styles.secondary} onClick={() => { setAnswers({}); setChecked(false); setTranscriptVisible(false); setNotice("Try again. Listen first, then answer without looking at the transcript."); }}>Try again</button></div>}
        <div className={styles.transcriptControls}><div><strong>Need a little help?</strong><p>Reveal the passage after your first listening attempt.</p></div><button type="button" className={styles.secondary} aria-expanded={transcriptVisible} onClick={() => setTranscriptVisible((visible) => !visible)}>{transcriptVisible ? "Hide transcript" : "Reveal transcript"}</button></div>
        {transcriptVisible && <div className={styles.transcript}><span className={styles.kicker}>TRANSCRIPT</span><p>{lesson.passage}</p><button type="button" className={styles.textButton} onClick={playPassage}>▶ Listen while reading</button></div>}
      </section>
      <p className={styles.privacyNote}>Audio is generated by your browser’s built-in speech engine. This exercise does not record or upload your microphone audio.</p>
    </div>
  );
}
