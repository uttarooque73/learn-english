"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { ListenPageControl } from "@/components/listen-button";
import { AuthStatus } from "@/components/auth-status";

type PageKey = "home" | "dashboard" | "practice" | "word-practice" | "custom-scenarios" | "conversation-coach" | "vocabulary" | "daily-vocabulary" | "progress" | "fluency" | "shadowing" | "pronunciation-coach" | "ai-and-us" | "settings" | "account" | "learning-plan" | "mistake-micro-lessons" | "english-quest" | "sentence-improver" | "challenge-simulator" | "speakup-adventures" | "smart-vocabulary-revision" | "ai-tutor" | "assessment" | "weekly-report" | "live-speaking-roleplay" | "listening-lab" | "adaptive-vocabulary" | "daily-speaking-missions" | "speaking-feedback" | "weakness-to-lessons";

const navigation: { key: PageKey; label: string; href: string; icon: string }[] = [
  { key: "home", label: "Overview", href: "/", icon: "⌂" },
  { key: "dashboard", label: "Learning dashboard", href: "/dashboard", icon: "▦" },
  { key: "learning-plan", label: "Daily learning plan", href: "/learning-plan", icon: "✓" },
  { key: "ai-tutor", label: "AI Personal Tutor", href: "/ai-tutor", icon: "✦" },
  { key: "assessment", label: "English assessment", href: "/assessment", icon: "✓" },
  { key: "weakness-to-lessons", label: "Weakness-to-Lesson Plan", href: "/weakness-to-lessons", icon: "✦" },
  { key: "weekly-report", label: "Weekly AI report", href: "/weekly-report", icon: "↗" },
  { key: "live-speaking-roleplay", label: "Live Speaking Roleplay", href: "/live-speaking-roleplay", icon: "🎙" },
  { key: "listening-lab", label: "Listening Comprehension Lab", href: "/listening-lab", icon: "♫" },
  { key: "adaptive-vocabulary", label: "Vocabulary in Context", href: "/adaptive-vocabulary", icon: "Aa" },
  { key: "daily-speaking-missions", label: "Daily Speaking Missions", href: "/daily-speaking-missions", icon: "🎯" },
  { key: "speaking-feedback", label: "AI Speaking Feedback", href: "/speaking-feedback", icon: "📊" },
  { key: "mistake-micro-lessons", label: "Mistake Micro-Lessons", href: "/mistake-micro-lessons", icon: "✎" },
  { key: "sentence-improver", label: "Smart Grammar Improver", href: "/sentence-improver", icon: "Aa" },
  { key: "practice", label: "Practice room", href: "/practice", icon: "◉" },
  { key: "english-quest", label: "English Quest", href: "/english-quest", icon: "🗺" },
  { key: "speakup-adventures", label: "SpeakUp Adventures", href: "/speakup-adventures", icon: "🧭" },
  { key: "challenge-simulator", label: "Real-World Challenges", href: "/challenge-simulator", icon: "🎯" },
  { key: "word-practice", label: "Words & sentences", href: "/word-practice", icon: "Aa" },
  { key: "custom-scenarios", label: "Custom scenarios", href: "/custom-scenarios", icon: "✦" },
  { key: "conversation-coach", label: "AI Conversation Coach", href: "/conversation-coach", icon: "🎙" },
  { key: "ai-and-us", label: "AI and Us", href: "/ai-and-us", icon: "Aa" },
  { key: "vocabulary", label: "Vocabulary", href: "/vocabulary", icon: "Aa" },
  { key: "smart-vocabulary-revision", label: "Smart Vocabulary Revision", href: "/smart-vocabulary-revision", icon: "↻" },
  { key: "daily-vocabulary", label: "Daily Vocabulary", href: "/daily-vocabulary", icon: "✦" },
  { key: "progress", label: "My progress", href: "/progress", icon: "↗" },
  { key: "fluency", label: "Fluency exercises", href: "/fluency", icon: "◷" },
  { key: "pronunciation-coach", label: "Pronunciation Coach", href: "/pronunciation-coach", icon: "🎙" },
  { key: "shadowing", label: "Shadowing & pronunciation", href: "/shadowing", icon: "♫" },
  { key: "settings", label: "Learning preferences", href: "/settings", icon: "⚙" },
  { key: "account", label: "Account & security", href: "/account", icon: "♙" },
];

export function AppShell({
  activePage,
  title,
  subtitle,
  children,
}: {
  activePage: PageKey;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="SpeakUp AI home">
          <span className="brand-mark">s</span>
          <span className="brand-copy">
            <strong>speakup<span>.</span></strong>
            <small>AI ENGLISH COACH</small>
          </span>
        </Link>

        <div className="nav-caption">YOUR SPACE</div>
        <button
          className="mobile-nav-toggle"
          type="button"
          aria-controls="main-navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span aria-hidden="true">{mobileNavOpen ? "×" : "☰"}</span>
          {mobileNavOpen ? "Close menu" : "Open menu"}
        </button>
        <nav id="main-navigation" className={`main-nav ${mobileNavOpen ? "mobile-nav-open" : ""}`} aria-label="Main navigation">
          {navigation.map((item) => (
            <Link
              key={item.key}
              className={`nav-link ${activePage === item.key ? "active" : ""}`}
              href={item.href}
              aria-current={activePage === item.key ? "page" : undefined}
              onClick={() => setMobileNavOpen(false)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.key === "practice" && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="coach-card">
            <div className="coach-spark">✦</div>
            <strong>Your voice matters.</strong>
            <p>Small conversations build big confidence.</p>
            <Link href="/conversation-coach" className="coach-link">Talk with your AI coach <span>↗</span></Link>
          </div>
          <div className="profile-row">
            <div className="avatar">U</div>
            <div className="profile-copy"><strong>My learning space</strong><span>Personal practice</span></div>
            <span className="profile-menu" aria-hidden="true">···</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{title}</strong></div>
          <div className="topbar-right"><span className="status-pill"><span className="status-dot" /> Local-first learning</span><AuthStatus /><div className="top-avatar">U</div></div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div><p className="eyebrow">YOUR ENGLISH JOURNEY</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>
            <div className="heading-date"><span className="date-icon">◷</span><span>One step at a time</span></div>
          </div>
          <ListenPageControl />
          {children}
          <footer className="page-footer"><span>SpeakUp AI</span><span>Practice at your own pace. Progress over perfection.</span></footer>
        </div>
      </main>
    </div>
  );
}
