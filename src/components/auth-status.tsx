"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SessionResponse = { authenticated?: boolean; user?: { email: string; displayName: string } };

export function AuthStatus() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<SessionResponse> : null)
      .then((data) => { if (active) setSession(data); })
      .catch(() => { if (active) setSession({ authenticated: false }); });
    return () => { active = false; };
  }, []);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
      setSession({ authenticated: false });
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  }

  if (session?.authenticated && session.user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Link href="/account" title={session.user.email} style={{ fontSize: 12, color: "var(--muted, #68716d)", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>{session.user.displayName}</Link>
        <button type="button" onClick={signOut} disabled={busy} style={{ border: "1px solid var(--line, #d8ded9)", background: "transparent", borderRadius: 9, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>{busy ? "Signing out…" : "Sign out"}</button>
      </div>
    );
  }

  return <Link href="/login" style={{ border: "1px solid var(--line, #d8ded9)", borderRadius: 9, padding: "8px 12px", textDecoration: "none", fontSize: 13, fontWeight: 700, color: "inherit" }}>Sign in</Link>;
}
