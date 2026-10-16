"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Scenario = {
  number: string;
  title: string;
  description: string;
  icon: string;
  tone: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function PracticeExperience({ prompts }: { prompts: Scenario[] }) {
  const [scenario, setScenario] = useState(prompts[0]?.title ?? "Free conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const conversationEnd = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    conversationEnd.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  function chooseScenario(title: string) {
    if (isStreaming) return;
    setScenario(title);
    setMessages([]);
    setError("");
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isStreaming) return;

    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setDraft("");
    setError("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, messages: nextMessages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "Unable to get an AI response.");
      }
      if (!response.body) throw new Error("The server did not return a response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages([...nextMessages, { role: "assistant", content: assistantText }]);
      }
      assistantText += decoder.decode();
      setMessages([...nextMessages, { role: "assistant", content: assistantText }]);
      if (!assistantText.trim()) setError("The AI returned an empty response. Please try again.");
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setMessages(nextMessages);
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function resetConversation() {
    if (isStreaming) abortRef.current?.abort();
    setMessages([]);
    setDraft("");
    setError("");
  }

  return (
    <>
      <section className="section-block" aria-labelledby="scenario-heading">
        <div className="section-heading">
          <div><p className="eyebrow">CHOOSE YOUR SCENARIO</p><h2 id="scenario-heading">What feels right today?</h2></div>
          <span className="section-note">Choose a topic to guide your coach</span>
        </div>
        <div className="scenario-grid">
          {prompts.map((prompt) => (
            <button
              className={`scenario-card scenario-choice ${scenario === prompt.title ? "selected" : ""}`}
              type="button"
              key={prompt.number}
              onClick={() => chooseScenario(prompt.title)}
              aria-pressed={scenario === prompt.title}
              disabled={isStreaming}
            >
              <span className="scenario-top"><span className={`scenario-icon ${prompt.tone}`}>{prompt.icon}</span><span className="scenario-number">{prompt.number}</span></span>
              <span className="scenario-title">{prompt.title}</span>
              <span className="scenario-description">{prompt.description}</span>
              <span className="scenario-bottom"><span>Guided conversation</span><span className="scenario-arrow">{scenario === prompt.title ? "✓" : "↗"}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="chat-panel" aria-label="AI English conversation">
        <div className="chat-header">
          <div className="chat-coach-mark">✦</div>
          <div className="chat-header-copy"><strong>Your AI conversation partner</strong><span>Topic: {scenario}</span></div>
          <button className="chat-reset" type="button" onClick={resetConversation} disabled={!messages.length && !error}>New conversation</button>
        </div>
        <div className="chat-transcript" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <span className="chat-welcome-spark">✦</span>
              <h3>Ready when you are.</h3>
              <p>Say hello, tell me about your day, or ask to practice a conversation about <strong>{scenario.toLowerCase()}</strong>.</p>
              <button type="button" className="suggestion-chip" onClick={() => setDraft("Hi! I want to practice my English. Can we start with a simple question?")}>Help me get started <span>↗</span></button>
            </div>
          ) : messages.map((message, index) => (
            <div className={`chat-message ${message.role === "user" ? "from-user" : "from-assistant"}`} key={`${index}-${message.role}`}>
              <span className="message-avatar">{message.role === "user" ? "U" : "✦"}</span>
              <div className="message-content">
                <span className="message-author">{message.role === "user" ? "You" : "SpeakUp AI"}</span>
                <p>{message.content || (isStreaming ? "Thinking…" : "")}</p>
              </div>
            </div>
          ))}
          {error && <p className="chat-error" role="alert">{error}</p>}
          <div ref={conversationEnd} />
        </div>
        <form className="chat-composer" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="chat-message">Your message</label>
          <textarea
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write what you would like to say…"
            rows={2}
            maxLength={4000}
            disabled={isStreaming}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="composer-footer"><span>Enter to send · Shift + Enter for a new line</span><button className="button button-dark send-button" type="submit" disabled={isStreaming || !draft.trim()}>{isStreaming ? "Thinking…" : "Send message"} <span>↗</span></button></div>
        </form>
        <p className="chat-privacy-note">Your conversation is sent to your configured local Ollama service. This phase does not save chat history after you leave or refresh.</p>
      </section>
    </>
  );
}
