"use client";

import { useEffect } from "react";
import { applyAccessibilityPreferences, getLearningPreferences } from "@/lib/learning-preferences";

export function PreferenceInitializer() {
  useEffect(() => {
    applyAccessibilityPreferences(getLearningPreferences());
    document.documentElement.dataset.appHydrated = "true";
  }, []);
  return null;
}
