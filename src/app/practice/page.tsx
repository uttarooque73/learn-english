import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PracticeExperience } from "@/components/practice-experience";

const prompts = [
  { number: "01", title: "Everyday life", description: "Talk about your day, interests, and routines.", icon: "☕", tone: "peach" },
  { number: "02", title: "At work", description: "Practice meetings, updates, and sharing ideas.", icon: "↗", tone: "lavender" },
  { number: "03", title: "Interview practice", description: "Prepare clear, confident answers to common questions.", icon: "✦", tone: "mint" },
  { number: "04", title: "Free conversation", description: "Choose your own subject and speak naturally.", icon: "◎", tone: "blue" },
];

export default function PracticePage() {
  return (
    <AppShell activePage="practice" title="Practice room" subtitle="Choose a comfortable starting point. There is no perfect answer.">
      <section className="practice-intro">
        <div><span className="intro-label"><span className="status-dot" /> YOUR SPACE TO SPEAK</span><h2>Let’s make English<br /><em>feel more natural.</em></h2><p>Choose a scenario, speak or type, and get personal feedback to improve with every exchange.</p></div>
        <div className="practice-illustration" aria-hidden="true"><div className="practice-circle circle-back" /><div className="practice-circle circle-front"><span>Hi!</span></div><span className="practice-star star-a">✦</span><span className="practice-star star-b">✳</span></div>
      </section>
      <PracticeExperience prompts={prompts} />
      <section className="coming-panel"><div className="coming-icon">✦</div><div><span className="eyebrow">LOCAL-FIRST LEARNING</span><h2>Practice, review, and keep growing</h2><p>Use browser speech recognition and spoken replies where supported. Your saved phrases and practice summaries stay in this browser.</p></div><Link href="/progress" className="text-link">View progress <span>→</span></Link></section>
    </AppShell>
  );
}
