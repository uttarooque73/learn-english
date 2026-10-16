"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { ListenPageControl } from "@/components/listen-button";

type PageKey = "home" | "practice" | "vocabulary" | "progress" | "fluency" | "settings";

const navigation: { key: PageKey; label: string; href: string; icon: string }[] = [
  { key: "home", label: "Overview", href: "/", icon: "⌂" },
  { key: "practice", label: "Practice room", href: "/practice", icon: "◉" },
  { key: "vocabulary", label: "Vocabulary", href: "/vocabulary", icon: "Aa" },
  { key: "progress", label: "My progress", href: "/progress", icon: "↗" },
  { key: "fluency", label: "Fluency exercises", href: "/fluency", icon: "◷" },
  { key: "settings", label: "Learning preferences", href: "/settings", icon: "⚙" },
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
            <Link href="/practice" className="coach-link">Start practicing <span>↗</span></Link>
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
          <div className="topbar-right"><span className="status-pill"><span className="status-dot" /> Local-first learning</span><div className="top-avatar">U</div></div>
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
