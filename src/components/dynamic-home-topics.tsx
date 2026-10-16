"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_SCENARIOS, getLearningScenarios, type LearningScenario } from "@/lib/learning-scenarios";

export function DynamicHomeTopics() {
  const [topics, setTopics] = useState<LearningScenario[]>(DEFAULT_SCENARIOS.slice(0, 3));
  useEffect(() => { const timer = window.setTimeout(() => setTopics(getLearningScenarios()), 0); return () => window.clearTimeout(timer); }, []);
  return <div className="topic-grid">
    {topics.map((topic, index) => <Link className="topic-card" href="/practice" key={topic.id}>
      <div className={`topic-art ${topic.tone}`}><span>{topic.icon}</span><small>{String(index + 1).padStart(2, "0")}</small></div>
      <div className="topic-copy"><h3>{topic.title}</h3><p>{topic.description}</p><span className="topic-arrow">↗</span></div>
    </Link>)}
  </div>;
}
