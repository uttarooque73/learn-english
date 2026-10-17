"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./custom-scenario-builder.module.css";

type CustomScenario = {
  id: string;
  title: string;
  description: string;
  originalSituation: string;
  learnerRole: string;
  aiRole: string;
  stakes: string;
  systemPrompt: string;
  starterMessage: string;
  createdAt: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };
const STORAGE_KEY = "speakup:custom-roleplay-scenarios:v1";

async function readSavedScenarios(): Promise<CustomScenario[]> {
  const response = await fetch("/api/persistence", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load your saved scenarios from the database.");
  const payload = await response.json() as { entries?: { key: string; value: string }[] };
  const entry = payload.entries?.find((item) => item.key === STORAGE_KEY);
  if (!entry) return [];
  try {
    const value: unknown = JSON.parse(entry.value);
    return Array.isArray(value) ? value.filter((item): item is CustomScenario =>
      Boolean(item && typeof item.id === "string" && typeof item.title === "string" &&
      typeof item.systemPrompt === "string" && typeof item.starterMessage === "string")
    ) : [];
  } catch {
    return [];
  }
}

async function persistScenarios(scenarios: CustomScenario[]) {
  const response = await fetch("/api/persistence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: STORAGE_KEY, value: JSON.stringify(scenarios) })
  });
  if (!response.ok) throw new Error("Could not save scenarios to the database.");
}

export function CustomScenarioBuilder() {
  const [description, setDescription] = useState("");
  const [scenarios, setScenarios] = useState<CustomScenario[]>([]);
  const [activeScenario, setActiveScenario] = useState<CustomScenario | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    void readSavedScenarios().then((saved) => { if (mounted) setScenarios(saved); })
      .catch((caught) => { if (mounted) setError(caught instanceof Error ? caught.message : "Could not load saved scenarios."); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }, [messages, loading]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generating || description.trim().length < 8) return;
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/scenario-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() })
      });
      const payload = await response.json() as { scenario?: Omit<CustomScenario, "id" | "originalSituation" | "createdAt">; error?: string };
      if (!response.ok || !payload.scenario) throw new Error(payload.error || "Could not generate your scenario.");
      const scenario: CustomScenario = {
        ...payload.scenario,
        id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
        originalSituation: description.trim(),
        createdAt: new Date().toISOString()
      };
      setActiveScenario(scenario);
      setMessages([{ role: "assistant", content: scenario.starterMessage }]);
      setDraft("");
      setNotice("Your custom role-play is ready. Start speaking or type your reply.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scenario generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveActiveScenario() {
    if (!activeScenario || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = [activeScenario, ...scenarios.filter((item) => item.id !== activeScenario.id)].slice(0, 50);
      await persistScenarios(next);
      setScenarios(next);
      setNotice("Scenario saved to your database.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this scenario.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteScenario(id: string) {
    const next = scenarios.filter((item) => item.id !== id);
    setError("");
    try {
      await persistScenarios(next);
      setScenarios(next);
      if (activeScenario?.id === id) {
        setActiveScenario(null);
        setMessages([]);
      }
      setNotice("Saved scenario deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this scenario.");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!activeScenario || !text || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "conversation",
          scenario: activeScenario.title,
          customScenario: {
            title: activeScenario.title,
            originalSituation: activeScenario.originalSituation,
            learnerRole: activeScenario.learnerRole,
            aiRole: activeScenario.aiRole,
            stakes: activeScenario.stakes,
            systemPrompt: activeScenario.systemPrompt
          },
          difficulty: "Beginner",
          messages: nextMessages
        })
      });
      if (!response.ok || !response.body) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "The role-play could not respond.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...nextMessages, { role: "assistant", content: answer }]);
      }
      answer += decoder.decode();
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
    } catch (caught) {
      setMessages(nextMessages);
      setError(caught instanceof Error ? caught.message : "The role-play could not respond.");
    } finally {
      setLoading(false);
    }
  }

  function reopenScenario(scenario: CustomScenario) {
    setActiveScenario(scenario);
    setMessages([{ role: "assistant", content: scenario.starterMessage }]);
    setError("");
    setNotice("Scenario reopened. Your new rehearsal starts here.");
  }

  return (
    <div className={styles.layout}>
      <section className={styles.builderCard}>
        <div className={styles.kicker}>YOUR SITUATION, YOUR PRACTICE</div>
        <h2>What conversation is coming up?</h2>
        <p className={styles.muted}>Describe it in English or your native language. Local Ollama turns it into a realistic role-play with clear roles, stakes, and a natural opening line.</p>
        <form onSubmit={generate} className={styles.builderForm}>
          <label htmlFor="scenario-description">Describe the real-world situation</label>
          <textarea id="scenario-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1200} minLength={8} required placeholder="For example: I need to explain to my manager why my project deadline is delayed by two days…" />
          <div className={styles.formFooter}><span>{description.length}/1200 characters</span><button type="submit" disabled={generating || description.trim().length < 8}>{generating ? "Building your scenario…" : "✦ Generate role-play"}</button></div>
        </form>
        <div className={styles.examples}>
          <span>Try one:</span>
          {[
            "Explain a two-day project delay to my manager",
            "Ask a landlord to repair a leaking kitchen sink",
            "Return a faulty item to a store"
          ].map((example) => <button key={example} type="button" onClick={() => setDescription(example)}>{example}</button>)}
        </div>
      </section>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {activeScenario && (
        <section className={styles.room} aria-label="Custom role-play room">
          <div className={styles.roomHeader}>
            <div><span className={styles.kicker}>LIVE PRACTICE SANDBOX</span><h2>{activeScenario.title}</h2><p>{activeScenario.description}</p></div>
            <button type="button" className={styles.secondaryButton} onClick={saveActiveScenario} disabled={saving}>{saving ? "Saving…" : "♡ Save scenario"}</button>
          </div>
          <div className={styles.roleGrid}>
            <div><span>Your role</span><strong>{activeScenario.learnerRole}</strong></div>
            <div><span>AI role</span><strong>{activeScenario.aiRole}</strong></div>
            <div><span>Goal</span><strong>{activeScenario.stakes}</strong></div>
          </div>
          <div className={styles.transcript} aria-live="polite">
            {messages.map((message, index) => <div key={index} className={message.role === "user" ? styles.userMessage : styles.aiMessage}><span>{message.role === "user" ? "YOU" : activeScenario.aiRole.toUpperCase()}</span><p>{message.content || (loading && index === messages.length - 1 ? "Thinking…" : "")}</p></div>)}
            <div ref={endRef} />
          </div>
          <form className={styles.replyForm} onSubmit={sendMessage}>
            <label htmlFor="scenario-reply">Your reply</label>
            <textarea id="scenario-reply" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={3} placeholder="Type what you would say in the real conversation…" disabled={loading} />
            <div><span>Stay in character. Ask for help if you get stuck.</span><button type="submit" disabled={loading || !draft.trim()}>{loading ? "Replying…" : "Send reply ↗"}</button></div>
          </form>
        </section>
      )}

      <section className={styles.savedSection}>
        <div className={styles.savedHeading}><div><span className={styles.kicker}>YOUR REHEARSAL LIBRARY</span><h2>Saved custom scenarios</h2></div><span>{scenarios.length}/50 saved</span></div>
        {scenarios.length === 0 ? <div className={styles.empty}>No saved scenarios yet. Generate one above and save it to your database to rehearse it again later.</div> : (
          <div className={styles.savedGrid}>
            {scenarios.map((scenario) => <article className={styles.savedCard} key={scenario.id}>
              <div className={styles.savedCardTop}><span>✦ REAL-WORLD PRACTICE</span><button type="button" aria-label={`Delete ${scenario.title}`} onClick={() => void deleteScenario(scenario.id)}>×</button></div>
              <h3>{scenario.title}</h3><p>{scenario.description}</p>
              <div className={styles.savedRoles}><span>You: {scenario.learnerRole}</span><span>AI: {scenario.aiRole}</span></div>
              <button type="button" className={styles.reopenButton} onClick={() => reopenScenario(scenario)}>Practice again <span>→</span></button>
            </article>)}
          </div>
        )}
      </section>
    </div>
  );
}
