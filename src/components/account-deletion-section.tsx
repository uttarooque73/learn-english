"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";

type ApiResponse = { error?: string; message?: string };

const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "1px solid #c98a8a",
  borderRadius: 10, padding: "12px 14px", background: "var(--surface, #fff)",
  color: "inherit", fontSize: 15,
};
const labelStyle: CSSProperties = { display: "grid", gap: 7, fontSize: 14, fontWeight: 650 };
const buttonStyle: CSSProperties = {
  border: "1px solid #a42e2e", borderRadius: 10, padding: "12px 16px",
  background: "#a42e2e", color: "#fff", fontWeight: 750, cursor: "pointer",
};

export function AccountDeletionSection() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (confirmation !== "DELETE") {
      setError('Type "DELETE" exactly to confirm permanent deletion.');
      return;
    }
    if (!window.confirm("Permanently delete your account and saved learning data? This cannot be undone.")) return;

    setBusy(true);
    try {
      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
        cache: "no-store",
      });
      const data = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(data.error || "Could not delete your account.");
      window.location.assign("/login?accountDeleted=1");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete your account.");
      setBusy(false);
    }
  }

  return (
    <section style={{
      background: "var(--surface, #fff)", border: "1px solid #e7bcbc",
      borderRadius: 16, padding: "clamp(18px, 3vw, 28px)",
    }}>
      <p className="eyebrow">DANGER ZONE</p>
      <h2 style={{ marginTop: 6, marginBottom: 8 }}>Delete your account</h2>
      <p style={{ color: "var(--muted, #68716d)", marginTop: 0, lineHeight: 1.6 }}>
        Permanently remove your account and saved learning records. This action cannot be undone.
        Download your learning data first if you want to keep a copy.
      </p>
      <form onSubmit={deleteAccount} style={{ display: "grid", gap: 14, maxWidth: 440 }}>
        <label style={labelStyle}>Current password
          <input style={inputStyle} type="password" required minLength={10} maxLength={128}
            autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label style={labelStyle}>Type DELETE to confirm
          <input style={inputStyle} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off" aria-describedby="delete-account-help" />
        </label>
        <p id="delete-account-help" style={{ margin: 0, fontSize: 12, color: "var(--muted, #68716d)" }}>
          Your password is checked on the server. Incorrect confirmation or password will leave your data unchanged.
        </p>
        <button style={buttonStyle} type="submit" disabled={busy || confirmation !== "DELETE"}>
          {busy ? "Deleting account…" : "Permanently delete account"}
        </button>
      </form>
      {error && <p role="alert" style={{ color: "#a42e2e", marginBottom: 0 }}>{error}</p>}
    </section>
  );
}
