"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AuthStatus } from "@/components/auth-status";

type CurrentUser = { displayName: string; email: string };

function userInitial(user: CurrentUser | null): string {
  return user?.displayName.trim().charAt(0).toLocaleUpperCase() || user?.email.trim().charAt(0).toLocaleUpperCase() || "U";
}

function UserAvatar({ user, className }: { user: CurrentUser | null; className: string }) {
  return <span className={className} aria-label={user ? `${user.displayName} profile` : "User profile"} title={user?.displayName || "User profile"}>{userInitial(user)}</span>;
}

function ProfileMenu({ onClose, user, onUserChange }: { onClose: () => void; user: CurrentUser | null; onUserChange: (user: CurrentUser | null) => void }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);


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
            <UserAvatar user={currentUser} className="avatar" />
            <div className="profile-copy"><strong>{currentUser?.displayName || "My learning space"}</strong><span>{currentUser?.email || "Personal practice"}</span></div>
            <ProfileMenu onClose={() => setMobileNavOpen(false)} user={currentUser} onUserChange={handleUserChange} />
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{title}</strong></div>
          <div className="topbar-right"><span className="status-pill"><span className="status-dot" /> Local-first learning</span><AuthStatus /><UserAvatar user={currentUser} className="top-avatar" /></div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div><p className="eyebrow">YOUR ENGLISH JOURNEY</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>
            <div className="heading-date"><span className="date-icon">◷</span><span>One step at a time</span></div>
          </div>
          {children}
          <footer className="page-footer"><span>SpeakUp AI</span><span>Practice at your own pace. Progress over perfection.</span></footer>
        </div>
      </main>
    </div>
  );
}
