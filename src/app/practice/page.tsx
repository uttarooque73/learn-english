import Link from "next/link";
import { AppShell } from "@/components/app-shell";

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
        <div><span className="intro-label"><span className="status-dot" /> YOUR SPACE TO SPEAK</span><h2>Let’s make English<br /><em>feel more natural.</em></h2><p>Choose a scenario and get ready to express yourself in your own words.</p></div>
        <div className="practice-illustration" aria-hidden="true"><div className="practice-circle circle-back" /><div className="practice-circle circle-front"><span>Hi!</span></div><span className="practice-star star-a">✦</span><span className="practice-star star-b">✳</span></div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">CHOOSE YOUR SCENARIO</p><h2>What feels right today?</h2></div><span className="section-note">Start simple. Build from there.</span></div>
        <div className="scenario-grid">{prompts.map((prompt) => <article className="scenario-card" key={prompt.number}>
          <div className="scenario-top"><span className={`scenario-icon ${prompt.tone}`}>{prompt.icon}</span><span className="scenario-number">{prompt.number}</span></div>
          <h3>{prompt.title}</h3><p>{prompt.description}</p>
          <div className="scenario-bottom"><span>Guided conversation</span><span className="scenario-arrow">↗</span></div>
        </article>)}</div>
      </section>

      <section className="coming-panel"><div className="coming-icon">✦</div><div><span className="eyebrow">COMING IN PHASE 2</span><h2>Your AI conversation partner</h2><p>The next phase connects this practice space to Ollama so you can have real conversations with your local language model. This page is currently a UI foundation; messages are not sent to an AI yet.</p></div><Link href="/" className="text-link">Back to overview <span>→</span></Link></section>
    </AppShell>
  );
}
