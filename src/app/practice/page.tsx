import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PracticeExperience } from "@/components/practice-experience";
import { ShadowingPractice } from "@/components/shadowing-practice";
import { SentenceBuilder } from "@/components/sentence-builder";
import { ConversationFlashcardExport } from "@/components/conversation-flashcard-export";

const prompts = [
  { number: "01", title: "Everyday life", description: "Talk about routines, hobbies, and everyday plans.", icon: "☕", tone: "peach" },
  { number: "02", title: "Job interview", description: "Practice interview questions and confident answers.", icon: "✦", tone: "mint" },
  { number: "03", title: "Daily stand-up", description: "Share yesterday's work, today's plan, and blockers.", icon: "↗", tone: "lavender" },
  { number: "04", title: "Team meeting", description: "Share ideas, agree politely, and clarify decisions.", icon: "◎", tone: "blue" },
  { number: "05", title: "Explain a technical concept", description: "Explain software topics clearly and answer follow-ups.", icon: "⌘", tone: "lavender" },
  { number: "06", title: "Restaurant conversation", description: "Order a meal, ask about options, and request the bill.", icon: "♨", tone: "peach" },
  { number: "07", title: "Travel and directions", description: "Ask for directions, tickets, and travel information.", icon: "↗", tone: "blue" },
  { number: "08", title: "Phone call", description: "Practice introductions, requests, and polite call endings.", icon: "☎", tone: "mint" },
  { number: "09", title: "Free conversation", description: "Choose any subject and speak naturally.", icon: "◎", tone: "blue" },
];

export default function PracticePage() {
  return (
    <AppShell activePage="practice" title="Practice room" subtitle="Choose a comfortable starting point. There is no perfect answer.">
      <section className="practice-intro">
        <div><span className="intro-label"><span className="status-dot" /> YOUR SPACE TO SPEAK</span><h2>Let’s make English<br /><em>feel more natural.</em></h2><p>Choose a scenario, speak or type, and get personal feedback to improve with every exchange.</p></div>
        <div className="practice-illustration" aria-hidden="true"><div className="practice-circle circle-back" /><div className="practice-circle circle-front"><span>Hi!</span></div><span className="practice-star star-a">✦</span><span className="practice-star star-b">✳</span></div>
      </section>
      <SentenceBuilder />
      <PracticeExperience prompts={prompts} />
      <ShadowingPractice />
      <ConversationFlashcardExport />
      <section className="coming-panel"><div className="coming-icon">✦</div><div><span className="eyebrow">LOCAL-FIRST LEARNING</span><h2>Practice, review, and keep growing</h2><p>Use browser speech recognition and spoken replies where supported. Your saved phrases and practice summaries stay in your learning notebook.</p></div><Link href="/progress" className="text-link">View progress <span>→</span></Link></section>
    </AppShell>
  );
}
