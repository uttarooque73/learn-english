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
    <AppShell activePage="practice" title="Practice room" subtitle="One conversation at a time. Build confidence at your own pace.">
      <section className="practice-intro">
        <div>
          <span className="intro-label"><span className="status-dot" /> YOUR DAILY SPEAKING SPACE</span>
          <h2>Speak a little.<br /><em>Grow every day.</em></h2>
          <p>Pick a real-life situation, start talking, and get useful feedback when you are ready.</p>
        </div>
        <div className="practice-illustration" aria-hidden="true"><div className="practice-circle circle-back" /><div className="practice-circle circle-front"><span>Hi!</span></div><span className="practice-star star-a">✦</span><span className="practice-star star-b">✳</span></div>
      </section>

      <PracticeExperience prompts={prompts} />

      <section className="practice-tools-section" aria-labelledby="practice-tools-heading">
        <div className="section-heading practice-tools-heading">
          <div><p className="eyebrow">OPTIONAL EXTRAS</p><h2 id="practice-tools-heading">More ways to improve</h2></div>
          <span className="section-note">Open a tool only when you need it</span>
        </div>
        <div className="practice-tools-list">
          <details className="practice-tool-accordion">
            <summary><span className="practice-tool-icon mint">Aa</span><span className="practice-tool-copy"><strong>Help me phrase this</strong><small>Turn a rough thought into natural English.</small></span><span className="practice-tool-chevron" aria-hidden="true">+</span></summary>
            <div className="practice-tool-content"><SentenceBuilder /></div>
          </details>
          <details className="practice-tool-accordion">
            <summary><span className="practice-tool-icon lavender">♫</span><span className="practice-tool-copy"><strong>Shadowing & pronunciation</strong><small>Listen to a sentence, repeat it, and review your speech.</small></span><span className="practice-tool-chevron" aria-hidden="true">+</span></summary>
            <div className="practice-tool-content"><ShadowingPractice /></div>
          </details>
          <details className="practice-tool-accordion">
            <summary><span className="practice-tool-icon peach">✧</span><span className="practice-tool-copy"><strong>Keep useful phrases</strong><small>Export phrases from your conversations as flashcards.</small></span><span className="practice-tool-chevron" aria-hidden="true">+</span></summary>
            <div className="practice-tool-content"><ConversationFlashcardExport /></div>
          </details>
        </div>
      </section>

      <section className="coming-panel"><div className="coming-icon">✦</div><div><span className="eyebrow">YOUR LEARNING NOTEBOOK</span><h2>Keep the progress you make</h2><p>Your saved phrases and practice summaries stay in your learning notebook on this device.</p></div><Link href="/progress" className="text-link">View progress <span>→</span></Link></section>
    </AppShell>
  );
}
