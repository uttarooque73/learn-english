"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { ListenPageControl } from "@/components/listen-button";

type PageKey = "home" | "practice" | "custom-scenarios" | "conversation-coach" | "vocabulary" | "daily-vocabulary" | "progress" | "fluency" | "shadowing" | "ai-and-us" | "settings" | "learning-plan" | "mistake-micro-lessons";

const navigation: { key: PageKey; label: string; href: string; icon: string }[] = [
  { key: "home", label: "Overview", href: "/", icon: "⌂" },
  { key: "learning-plan", label: "Daily learning plan", href: "/learning-plan", icon: "✓" },
  { key: "mistake-micro-lessons", label: "Mistake Micro-Lessons", href: "/mistake-micro-lessons", icon: "✎" },
  { key: "practice", label: "Practice room", href: "/practice", icon: "◉" },
  { key: "custom-scenarios", label: "Custom scenarios", href: "/custom-scenarios", icon: "✦" },
  { key: "conversation-coach", label: "AI Conversation Coach", href: "/conversation-coach", icon: "🎙" },
  { key: "ai-and-us", label: "AI and Us", href: "/ai-and-us", icon: "Aa" },
  { key: "vocabulary", label: "Vocabulary", href: "/vocabulary", icon: "Aa" },
  { key: "daily-vocabulary", label: "Daily Vocabulary", href: "/daily-vocabulary", icon: "✦" },
  { key: "progress", label: "My progress", href: "/progress", icon: "↗" },
  { key: "fluency", label: "Fluency exercises", href: "/fluency", icon: "◷" },
  { key: "shadowing", label: "Shadowing & pronunciation", href: "/shadowing", icon: "♫" },
  { key: "settings", label: "Learning preferences", href: "/settings", icon: "⚙" },
];

export function AppShell({ activePage, title, subtitle, children }: { activePage: PageKey; title: string; subtitle: string; children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="SpeakUp AI home"><span className="brand-mark">s</span><span className="brand-copy"><strong>speakup<span>.</span></strong><small>AI ENGLISH COACH</small></span></Link>
        <div className="nav-caption">YOUR SPACE</div>
        <button className="mobile-nav-toggle" type="button" aria-controls="main-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}><span aria-hidden="true">{mobileNavOpen ? "×" : "☰"}</span>{mobileNavOpen ? "Close menu" : "Open menu"}</button>
        <nav id="main-navigation" className={`main-nav ${mobileNavOpen ? "mobile-nav-open" : ""}`} aria-label="Main navigation">
          {navigation.map((item) => <Link key={item.key} className={`nav-link ${activePage === item.key ? "active" : ""}`} href={item.href} aria-current={activePage === item.key ? "page" : undefined} onClick={() => setMobileNavOpen(false)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>{item.key === "practice" && <span className="nav-dot" />}</Link>)}
        </nav>
        <div className="sidebar-bottom"><div className="coach-card"><div className="coach-spark">✦</div><strong>Your voice matters.</strong><p>Small conversations build big confidence.</p><Link className="coach-link" href="/conversation-coach">Practice conversation <span>→</span></Link></div><div className="profile-row"><div className="avatar">L</div><div className="profile-copy"><strong>English learner</strong><span>Building fluency</span></div><span className="profile-menu">···</span></div></div>
      </aside>
      <main className="main-panel"><header className="topbar"><div className="breadcrumb"><span>SpeakUp AI</span><span className="crumb-slash">/</span><strong>{title}</strong></div><div className="topbar-right"><ListenPageControl /><span className="status-pill"><span className="status-dot" /> Personal learning space</span><div className="top-avatar">L</div></div></header><div className="page-content"><div className="page-heading"><div><p className="eyebrow">YOUR LEARNING SPACE</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div></div>{children}</div></main>
    </div>
  );
}
