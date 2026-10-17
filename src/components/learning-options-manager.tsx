"use client";

import { useEffect, useState } from "react";
import { addLearningScenario, getLearningScenarios, removeLearningScenario, type LearningScenario } from "@/lib/learning-scenarios";
import { initializeDatabasePersistence } from "@/lib/client-persistence";

export function LearningOptionsManager() {
  const [items, setItems] = useState<LearningScenario[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("✦");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => { let active = true; void initializeDatabasePersistence().then(() => { if (active) setItems(getLearningScenarios()); }).catch(() => { if (active) setError("Could not load your options from the database."); }); return () => { active = false; }; }, []);

  function submit() {
    setError(""); setStatus("");
    if (!title.trim() || !description.trim()) {
      setError("Enter an option title and a practice description before adding it.");
      return;
    }
    try {
      addLearningScenario(title, description, icon);
      setItems(getLearningScenarios()); setTitle(""); setDescription("");
      setStatus("Option added. It is now available in What feels right today? and your practice suggestions.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not add this option."); }
  }

  return <section className="settings-card dynamic-options-manager" aria-labelledby="dynamic-options-heading">
    <div className="settings-card-heading"><span className="settings-symbol" aria-hidden="true">＋</span><div><h2 id="dynamic-options-heading">Customize your practice options</h2><p>Add your own situations, topics, and role-plays. They will appear alongside the built-in options throughout the practice experience. Your options are saved in the application database.</p></div></div>
    <div className="dynamic-option-form">
      <label className="settings-field">Option title<input maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Explain my project to a client" /></label>
      <label className="settings-field">What should you practice?<textarea maxLength={180} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Describe the project clearly, explain trade-offs, and answer questions." /></label>
      <label className="settings-field">Icon<select value={icon} onChange={(event) => setIcon(event.target.value)}>{["✦","☕","💼","🎯","🌍","☎","◎","↗","⌘","♨"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <button className="button button-dark" type="button" disabled={!title.trim() || !description.trim()} onClick={submit}>＋ Add option</button>
    </div>
    {error && <p className="dynamic-options-message" role="alert">{error}</p>}
    {status && <p className="dynamic-options-message" role="status">{status}</p>}
    <div className="dynamic-options-list"><div className="dynamic-options-list-heading"><strong>Your available options</strong><span>{items.length} total · {items.filter((item) => item.custom).length} custom</span></div>
      {items.map((item) => <article className="dynamic-option-row" key={item.id}><span className={`scenario-icon ${item.tone}`}>{item.icon}</span><div><strong>{item.title}</strong><p>{item.description}</p></div>{item.custom ? <button type="button" className="remove-word" onClick={() => { removeLearningScenario(item.id); setItems(getLearningScenarios()); setStatus(`Removed "${item.title}".`); }}>Remove</button> : <span className="dynamic-option-default">Built in</span>}</article>)}
    </div>
  </section>;
}
