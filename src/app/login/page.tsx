"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, displayName, email, password }),
      });
      const result = await response.json() as { error?: string; ok?: boolean };
      if (!response.ok) {
        setError(result.error || "We could not sign you in. Please try again.");
        return;
      }
      const requested = searchParams.get("next");
      const destination = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
      router.replace(destination);
      router.refresh();
    } catch {
      setError("Could not connect to SpeakUp AI. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 480px)", background: "#f6f5f1", color: "#242a29" }}>
      <section style={{ padding: "clamp(32px, 7vw, 96px)", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "linear-gradient(145deg, #163e36, #245b4e)", color: "#fff" }}>
        <Link href="/" style={{ color: "inherit", textDecoration: "none", fontSize: 24, fontWeight: 800 }}>speakup<span style={{ color: "#f1c66d" }}>.</span></Link>
        <div style={{ maxWidth: 520, padding: "64px 0" }}>
          <p style={{ letterSpacing: ".18em", fontSize: 12, fontWeight: 700, color: "#f1c66d" }}>YOUR ENGLISH JOURNEY</p>
          <h1 style={{ fontSize: "clamp(38px, 5vw, 64px)", lineHeight: 1.05, letterSpacing: "-.04em", margin: "20px 0" }}>Find your words.<br /><em style={{ color: "#f1c66d" }}>Own your voice.</em></h1>
          <p style={{ maxWidth: 420, fontSize: 17, lineHeight: 1.7, color: "#e0ebe5" }}>Sign in to keep your progress, revisit your learning history, and get practice recommendations shaped around you.</p>
        </div>
        <p style={{ fontSize: 13, color: "#d3e2da" }}>Your progress belongs to you.</p>
      </section>
      <section style={{ padding: "32px clamp(24px, 5vw, 64px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <Link href="/" style={{ color: "#397363", fontSize: 14, textDecoration: "none" }}>← Back to SpeakUp</Link>
          <p style={{ marginTop: 40, color: "#47786b", fontSize: 12, fontWeight: 800, letterSpacing: ".14em" }}>{mode === "login" ? "WELCOME BACK" : "START YOUR JOURNEY"}</p>
          <h2 style={{ fontSize: 34, letterSpacing: "-.04em", margin: "10px 0" }}>{mode === "login" ? "Sign in" : "Create your account"}</h2>
          <p style={{ color: "#68716d", lineHeight: 1.6, marginBottom: 28 }}>{mode === "login" ? "Pick up right where you left off." : "Your learning history will be saved to your account."}</p>
          <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
            {mode === "register" && <label style={{ display: "grid", gap: 7, fontSize: 14, fontWeight: 650 }}>Your name<input required minLength={2} maxLength={60} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should we address you?" style={fieldStyle} /></label>}
            <label style={{ display: "grid", gap: 7, fontSize: 14, fontWeight: 650 }}>Email or username<input required type="text" maxLength={254} autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="umarkhan or you@example.com" style={fieldStyle} /></label>
            <label style={{ display: "grid", gap: 7, fontSize: 14, fontWeight: 650 }}>Password<input required type="password" minLength={mode === "register" ? 10 : 1} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "Enter your password" : "At least 10 characters"} style={fieldStyle} /></label>
            {error && <p role="alert" style={{ margin: 0, color: "#a42e2e", background: "#fff0ed", borderRadius: 10, padding: 12, fontSize: 14 }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ marginTop: 4, border: 0, borderRadius: 12, background: "#245b4e", color: "white", fontWeight: 750, fontSize: 15, padding: "15px 18px", cursor: busy ? "wait" : "pointer", opacity: busy ? .7 : 1 }}>{busy ? "Please wait…" : mode === "login" ? "Sign in securely" : "Create account"}</button>
          </form>
          <p style={{ marginTop: 24, color: "#68716d", fontSize: 14, textAlign: "center" }}>{mode === "login" ? "New to SpeakUp AI?" : "Already have an account?"}{" "}<button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} style={{ background: "none", border: 0, padding: 0, color: "#245b4e", fontWeight: 750, cursor: "pointer" }}>{mode === "login" ? "Create an account" : "Sign in instead"}</button></p>
          <p style={{ marginTop: 20, fontSize: 12, color: "#7c827f", lineHeight: 1.5 }}>Use a unique password. Account credentials are stored as a salted password hash, never as plain text.</p>
        </div>
      </section>
      <style jsx global>{`@media(max-width:760px){main{grid-template-columns:1fr!important}main>section:first-child{display:none!important}main>section:last-child{min-height:100vh}}`}</style>
    </main>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d8ded9",
  borderRadius: 10,
  background: "#fff",
  padding: "13px 14px",
  fontSize: 15,
  outlineColor: "#397363",
};

export default function LoginPage() {
  return <Suspense fallback={<main style={{ padding: 40 }}>Loading sign in…</main>}><LoginForm /></Suspense>;
}
