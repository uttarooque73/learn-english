import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const topics = [
  { icon: "☕", title: "Everyday conversation", detail: "Feel more natural in daily chats", tone: "peach" },
  { icon: "💼", title: "Work & meetings", detail: "Share ideas with confidence", tone: "lavender" },
  { icon: "🎤", title: "Speak for one minute", detail: "Build fluency, one thought at a time", tone: "mint" },
];

export default function HomePage() {
  return (
    <AppShell activePage="home" title="Good to see you" subtitle="A little practice today goes a long way.">
      <section className="welcome-banner">
        <div className="welcome-copy">
          <div className="welcome-kicker"><span>✦</span> YOUR DAILY MOMENT</div>
          <h2>Find your words.<br /><em>Own your voice.</em></h2>
          <p>No pressure to be perfect. Just show up, speak a little, and get better every day.</p>
          <Link className="button button-light" href="/practice">Start a practice session <span>↗</span></Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="art-sun">✦</div>
          <div className="speech-bubble bubble-one">I can do this!</div>
          <div className="speech-bubble bubble-two">One step at a time <span>♡</span></div>
          <div className="art-letter">A<span>.</span></div>
          <div className="art-caption">YOUR VOICE, YOUR PACE</div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">YOUR ROUTINE</p><h2>Your learning snapshot</h2></div><span className="section-note">Your progress will appear as you practice</span></div>
        <div className="stats-grid">
          <article className="stat-card"><div className="stat-top"><span className="stat-icon peach">◷</span><span className="stat-tag">GET STARTED</span></div><div className="stat-value">0 <small>min</small></div><p>Practice time</p><div className="stat-foot"><span className="stat-line peach-line" />Your first session is waiting</div></article>
          <article className="stat-card"><div className="stat-top"><span className="stat-icon lavender">✦</span><span className="stat-tag">FRESH START</span></div><div className="stat-value">0</div><p>Sessions completed</p><div className="stat-foot"><span className="stat-line lavender-line" />Every conversation counts</div></article>
          <article className="stat-card"><div className="stat-top"><span className="stat-icon mint">Aa</span><span className="stat-tag">GROW YOUR WORDS</span></div><div className="stat-value">0</div><p>Words saved</p><div className="stat-foot"><span className="stat-line mint-line" />Collect useful expressions</div></article>
        </div>
      </section>

      <section className="section-block topic-section">
        <div className="section-heading"><div><p className="eyebrow">PICK UP WHERE YOU ARE</p><h2>What would you like to practice?</h2></div><Link className="text-link" href="/practice">Explore practice <span>→</span></Link></div>
        <div className="topic-grid">
          {topics.map((topic, index) => <Link className="topic-card" href="/practice" key={topic.title}>
            <div className={`topic-art ${topic.tone}`}><span>{topic.icon}</span><small>0{index + 1}</small></div>
            <div className="topic-copy"><h3>{topic.title}</h3><p>{topic.detail}</p><span className="topic-arrow">↗</span></div>
          </Link>)}
        </div>
      </section>

      <section className="next-step-card"><div className="next-step-icon">✎</div><div><strong>Your first step is the most important.</strong><p>Try a short conversation. You can review corrections and save new words as those features arrive.</p></div><Link href="/practice" className="text-link">Let’s begin <span>→</span></Link></section>
    </AppShell>
  );
}
