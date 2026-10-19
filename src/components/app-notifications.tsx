"use client";

import { useEffect, useState } from "react";

type ToastMessage = {
  id: number;
  title: string;
  description?: string;
  tone: "success" | "error" | "info";
};

declare global {
  interface WindowEventMap {
    "speakup:toast": CustomEvent<Omit<ToastMessage, "id">>;
  }
}

export function notifyUser(message: Omit<ToastMessage, "id">) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("speakup:toast", { detail: message }));
}

export function AppNotifications() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    let nextId = 0;
    const show = (event: WindowEventMap["speakup:toast"]) => {
      const id = ++nextId;
      setMessages((current) => [...current.slice(-2), { ...event.detail, id }]);
      window.setTimeout(() => {
        setMessages((current) => current.filter((item) => item.id !== id));
      }, 5500);
    };
    window.addEventListener("speakup:toast", show);
    return () => window.removeEventListener("speakup:toast", show);
  }, []);

  return (
    <div className="app-notifications" aria-live="polite" aria-relevant="additions text" aria-atomic="false">
      {messages.map((message) => (
        <div className={`app-toast app-toast-${message.tone}`} key={message.id} role={message.tone === "error" ? "alert" : "status"}>
          <span className="app-toast-icon" aria-hidden="true">
            {message.tone === "success" ? "✓" : message.tone === "error" ? "!" : "i"}
          </span>
          <div className="app-toast-copy">
            <strong>{message.title}</strong>
            {message.description && <p>{message.description}</p>}
          </div>
          <button className="app-toast-dismiss" type="button" aria-label="Dismiss notification" onClick={() => setMessages((current) => current.filter((item) => item.id !== message.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
