"use client";

type PersistedEntry = { key: string; value: string };
type PersistenceWindow = Window & { __speakupDatabaseInitialized?: boolean };
const values = new Map<string, string>();
const dirtyKeys = new Set<string>();
let initialization: Promise<void> | undefined;

async function requestPersistence(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers } });
}

/** Load durable values from SQLite and import legacy app keys from localStorage once. */
export function initializeDatabasePersistence(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const appWindow = window as PersistenceWindow;
  if (appWindow.__speakupDatabaseInitialized) return Promise.resolve();
  if (initialization) return initialization;
  initialization = (async () => {
    const legacy: Array<[string, string]> = [];
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("speakup:")) {
          const value = window.localStorage.getItem(key);
          if (value !== null) legacy.push([key, value]);
        }
      }
    } catch { /* Restricted browser storage must not prevent database reads. */ }

    const response = await requestPersistence("/api/persistence", { method: "GET" });
    if (!response.ok) throw new Error("Could not load saved learning data from the database.");
    const payload = await response.json() as { entries?: PersistedEntry[] };
    const serverKeys = new Set<string>();
    for (const entry of payload.entries ?? []) {
      if (typeof entry.key !== "string" || typeof entry.value !== "string") continue;
      serverKeys.add(entry.key);
      if (!dirtyKeys.has(entry.key)) values.set(entry.key, entry.value);
    }

    for (const [key, value] of legacy) {
      if (!serverKeys.has(key) && !dirtyKeys.has(key)) {
        const migration = await requestPersistence("/api/persistence", { method: "POST", body: JSON.stringify({ key, value }) });
        if (!migration.ok) throw new Error("Could not migrate saved learning data to the database.");
        values.set(key, value);
      }
      if (serverKeys.has(key) || !dirtyKeys.has(key)) {
        try { window.localStorage.removeItem(key); } catch { /* Ignore restricted browser storage. */ }
      }
    }

    // Retry writes/deletes that failed during an earlier session.
    for (const key of [...dirtyKeys]) {
      const value = values.get(key);
      const retry = value === undefined
        ? await requestPersistence("/api/persistence?key=" + encodeURIComponent(key), { method: "DELETE" })
        : await requestPersistence("/api/persistence", { method: "POST", body: JSON.stringify({ key, value }) });
      if (!retry.ok) throw new Error("Could not synchronize saved learning data with the database.");
      dirtyKeys.delete(key);
    }
    appWindow.__speakupDatabaseInitialized = true;
  })().catch((error) => { initialization = undefined; throw error; });
  return initialization;
}

export function readPersistedValue(key: string): string | null { return values.get(key) ?? null; }

export function writePersistedValue(key: string, value: string): void {
  values.set(key, value);
  dirtyKeys.add(key);
  void requestPersistence("/api/persistence", { method: "POST", body: JSON.stringify({ key, value }) })
    .then((response) => { if (response.ok) dirtyKeys.delete(key); else if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized; })
    .catch(() => { if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized; });
}

export function deletePersistedValue(key: string): void {
  values.delete(key);
  dirtyKeys.add(key);
  void requestPersistence("/api/persistence?key=" + encodeURIComponent(key), { method: "DELETE" })
    .then((response) => { if (response.ok) dirtyKeys.delete(key); else if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized; })
    .catch(() => { if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized; });
}

/** Reset the in-memory cache in isolated unit tests. */
export function resetPersistenceCacheForTests(): void {
  values.clear(); dirtyKeys.clear(); initialization = undefined;
  if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized;
}
