"use client";

type PersistedEntry = { key: string; value: string };
type PersistenceWindow = Window & { __speakupPersistenceInitialized?: boolean };

async function requestPersistence(input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    return undefined;
  }
}

/**
 * Hydrates app-owned localStorage keys from PostgreSQL, migrates existing local
 * data on first use, and mirrors subsequent mutations to the server.
 * localStorage remains a fast client cache; PostgreSQL is the durable copy.
 */
export async function initializeDatabasePersistence(): Promise<void> {
  if (typeof window === "undefined") return;
  const appWindow = window as PersistenceWindow;
  if (appWindow.__speakupPersistenceInitialized) return;
  appWindow.__speakupPersistenceInitialized = true;

  const storage = window.localStorage;
  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  const nativeClear = Storage.prototype.clear;
  const existing = new Map<string, string>();
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null) {
      const value = nativeGetItem.call(storage, key);
      if (value !== null) existing.set(key, value);
    }
  }

  const response = await requestPersistence("/api/persistence", { method: "GET" });
  if (response?.ok) {
    const payload = await response.json() as { entries?: PersistedEntry[] };
    const serverEntries = new Set<string>();
    for (const entry of payload.entries ?? []) {
      if (typeof entry.key !== "string" || typeof entry.value !== "string") continue;
      serverEntries.add(entry.key);
      nativeSetItem.call(storage, entry.key, entry.value);
    }
    // Migrate existing browser data into PostgreSQL without overwriting newer
    // database values. The server response establishes the source-of-truth keys.
    for (const [key, value] of existing) {
      if (!serverEntries.has(key)) {
        void requestPersistence("/api/persistence", { method: "POST", body: JSON.stringify({ key, value }) });
      }
    }
  }

  Storage.prototype.setItem = function (key: string, value: string) {
    nativeSetItem.call(this, key, value);
    if (this === storage) {
      void requestPersistence("/api/persistence", { method: "POST", body: JSON.stringify({ key, value }) });
    }
  };
  Storage.prototype.removeItem = function (key: string) {
    nativeRemoveItem.call(this, key);
    if (this === storage) {
      void requestPersistence(`/api/persistence?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    }
  };
  Storage.prototype.clear = function () {
    nativeClear.call(this);
    if (this === storage) void requestPersistence("/api/persistence", { method: "DELETE" });
  };
}
