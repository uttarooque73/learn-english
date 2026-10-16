"use client";

import { useEffect } from "react";

export function ClientReadyMarker() {
  useEffect(() => {
    document.documentElement.dataset.appHydrated = "true";
  }, []);
  return null;
}
