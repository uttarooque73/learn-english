"use client";

import { useEffect } from "react";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import { applyAccessibilityPreferences, getLearningPreferences } from "@/lib/learning-preferences";
import { flushPendingLearningEvidence } from "@/lib/learning-evidence-client";

export function PreferenceInitializer() {
  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().catch(() => undefined).finally(() => {
      if (active) {
        applyAccessibilityPreferences(getLearningPreferences());
        void flushPendingLearningEvidence().catch(() => undefined);
      }
    });
    return () => { active = false; };
  }, []);
  return null;
}
