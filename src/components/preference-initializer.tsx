"use client";

import { useEffect } from "react";
import { initializeDatabasePersistence } from "@/lib/client-persistence";
import { applyAccessibilityPreferences, getLearningPreferences } from "@/lib/learning-preferences";

export function PreferenceInitializer() {
  useEffect(() => {
    let active = true;
    void initializeDatabasePersistence().finally(() => {
      if (active) applyAccessibilityPreferences(getLearningPreferences());
    });
    return () => { active = false; };
  }, []);
  return null;
}
