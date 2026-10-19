"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { AccountDeletionSection } from "@/components/account-deletion-section";

type Profile = { email: string; displayName: string; createdAt: string };
type ApiResponse = { user?: Profile; message?: string; error?: string; ok?: boolean };

const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "1px solid var(--line, #d8ded9)",
  borderRadius: 10, padding: "12px 14px", background: "var(--surface, #fff)",
  color: "inherit", fontSize: 15,
};
const labelStyle: CSSProperties = { display: "grid", gap: 7, fontSize: 14, fontWeight: 650 };
const buttonStyle: CSSProperties = {
  border: 0, borderRadius: 10, padding: "12px 16px", background: "#245b4e",
  color: "#fff", fontWeight: 750, cursor: "pointer",
};

export function AccountSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"profile" | "password" | "export" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/profile", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as ApiResponse;
        if (!response.ok) throw new Error(data.error || "Could not load account details.");
        return data;
      })
      .then((data) => {
        if (!active || !data.user) return;
        setProfile(data.user);
        setDisplayName(data.user.displayName);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load account details.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("profile");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", displayName }),
      });
      const data = await response.json() as ApiResponse;
      if (!response.ok || !data.user) throw new Error(data.error || "Could not update your profile.");
      setProfile(data.user);
      setDisplayName(data.user.displayName);
      setNotice(data.message || "Profile updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update your profile.");
    } finally { setBusy(null); }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (newPassword !== confirmPassword) { setError("The new passwords do not match."); return; }
    setBusy("password");
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "password", currentPassword, newPassword }),
      });
      const data = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(data.error || "Could not change your password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice(data.message || "Password changed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change your password.");
    } finally { setBusy(null); }
  }

  async function exportLearningData() {
    setBusy("export");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/account/export", { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json() as ApiResponse;
        throw new Error(data.error || "Could not export your learning data.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "speakup-learning-data.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice("Your learning data export is ready.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export your learning data.");
    } finally { setBusy(null); }
  }

  if (loading) return <section className="section-block"><p>Loading account details…</p></section>;
  if (!profile) return <section className="section-block"><p role="alert">{error || "Sign in to manage your account."}</p><a className="text-link" href="/login">Go to sign in →</a></section>;

  return (
    <div style={{ display: "grid", gap: 22, maxWidth: 820 }}>
      <section style={cardStyle}>
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h2 style={{ marginTop: 6, marginBottom: 8 }}>Profile details</h2>
        <p style={paragraphStyle}>Your account keeps learning progress connected to you when you sign in on another device.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, margin: "20px 0" }}>
          <div style={infoStyle}><span style={mutedStyle}>Email address</span><strong style={{ overflowWrap: "anywhere" }}>{profile.email}</strong><span style={mutedStyle}>Email changes are not available yet.</span></div>
          <div style={infoStyle}><span style={mutedStyle}>Member since</span><strong>{new Date(profile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong><span style={mutedStyle}>Your saved learning history stays linked to this account.</span></div>
        </div>
        <form onSubmit={submitProfile} style={formStyle}>
          <label style={labelStyle}>Display name<input style={inputStyle} required minLength={2} maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></label>
          <button style={buttonStyle} type="submit" disabled={busy !== null}>{busy === "profile" ? "Saving…" : "Save profile"}</button>
        </form>
      </section>

      <section style={cardStyle}>
        <p className="eyebrow">SECURITY</p>
        <h2 style={{ marginTop: 6, marginBottom: 8 }}>Change password</h2>
        <p style={paragraphStyle}>Use your current password to set a new one. Choose at least 10 characters.</p>
        <form onSubmit={submitPassword} style={formStyle}>
          <label style={labelStyle}>Current password<input style={inputStyle} required type="password" minLength={10} maxLength={128} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label style={labelStyle}>New password<input style={inputStyle} required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label style={labelStyle}>Confirm new password<input style={inputStyle} required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          <button style={buttonStyle} type="submit" disabled={busy !== null}>{busy === "password" ? "Changing password…" : "Change password"}</button>
        </form>
      </section>

      <section style={cardStyle}>
        <p className="eyebrow">YOUR DATA</p>
        <h2 style={{ marginTop: 6, marginBottom: 8 }}>Export your learning history</h2>
        <p style={paragraphStyle}>Download a JSON copy of learning records saved to your account. The export is scoped to your account and excludes password hashes and authentication tokens.</p>
        <button style={buttonStyle} type="button" onClick={exportLearningData} disabled={busy !== null}>{busy === "export" ? "Preparing export…" : "Download my learning data"}</button>
      </section>

      <AccountDeletionSection />

      {error && <p role="alert" style={messageStyle("#fff0ed", "#a42e2e")}>{error}</p>}
      {notice && <p role="status" style={messageStyle("#e8f5ed", "#245b4e")}>{notice}</p>}
    </div>
  );
}

const cardStyle: CSSProperties = { background: "var(--surface, #fff)", border: "1px solid var(--line, #d8ded9)", borderRadius: 16, padding: "clamp(18px, 3vw, 28px)" };
const infoStyle: CSSProperties = { display: "grid", gap: 6, borderRadius: 12, background: "var(--surface-muted, #f6f5f1)", padding: 14, minWidth: 0 };
const mutedStyle: CSSProperties = { color: "var(--muted, #68716d)", fontSize: 12 };
const paragraphStyle: CSSProperties = { color: "var(--muted, #68716d)", marginTop: 0, lineHeight: 1.6 };
const formStyle: CSSProperties = { display: "grid", gap: 14, maxWidth: 440 };
function messageStyle(background: string, color: string): CSSProperties {
  return { background, color, borderRadius: 10, padding: 12, margin: 0, fontSize: 14 };
}
