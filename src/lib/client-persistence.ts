"use client";

type PersistedEntry = { key: string; value: string };
type PersistenceWindow = Window & { __speakupDatabaseInitialized?: boolean };
const values = new Map<string, string>();
const dirtyKeys = new Set<string>();
let initialization: Promise<void> | undefined;
let revision = 0;

async function requestPersistence(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

/**
 * Hydrate the synchronous client cache from SQLite.
 * Existing speakup:* browser keys are imported once for backward compatibility,
 * then removed from browser storage. New application writes go to the database.
 */
export function initializeDatabasePersistence(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const appWindow = window as PersistenceWindow;
  if (appWindow.__speakupDatabaseInitialized) return Promise.resolve();
  if (initialization) return initialization;

  initialization = (async () => {
    const startingRevision = revision;
    const legacy: Array<[string, string]> = [];
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key?.startsWith("speakup:")) continue;
        const value = window.localStorage.getItem(key);
        if (value !== null) legacy.push([key, value]);
      }
    } catch {
      // Browser storage can be disabled. SQLite remains the source of truth.
    }

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
      // A concurrent edit wins over stale legacy data.
      if (!serverKeys.has(key) && !dirtyKeys.has(key)) {
        const migration = await requestPersistence("/api/persistence", {
          method: "POST",
          body: JSON.stringify({ key, value }),
        });
        if (!migration.ok) throw new Error("Could not migrate saved learning data to the database.");
        values.set(key, value);
      }
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Do not fail app initialization if cleanup is restricted.
      }
    }

    // Flush changes made while the initial read was in flight.
    if (revision !== startingRevision || dirtyKeys.size > 0) {
      for (const key of [...dirtyKeys]) {
        const value = values.get(key);
        const sync = value === undefined
          ? await requestPersistence("/api/persistence?key=" + encodeURIComponent(key), { method: "DELETE" })
          : await requestPersistence("/api/persistence", { method: "POST", body: JSON.stringify({ key, value }) });
        if (!sync.ok) throw new Error("Could not synchronize saved learning data with the database.");
        dirtyKeys.delete(key);
      }
    }
    appWindow.__speakupDatabaseInitialized = true;
  })().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export function readPersistedValue(key: string): string | null {
  return values.get(key) ?? null;
}

export function writePersistedValue(key: string, value: string): void {
  revision += 1;
  values.set(key, value);
  dirtyKeys.add(key);
  void requestPersistence("/api/persistence", { method: "POST", body: JSON.stringify({ key, value }) })
    .then((response) => {
      if (response.ok) dirtyKeys.delete(key);
      else {
        initialization = undefined;
        if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized;
      }
    })
    .catch(() => {
      initialization = undefined;
      if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized;
    });
}

export function deletePersistedValue(key: string): void {
  revision += 1;
  values.delete(key);
  dirtyKeys.add(key);
  void requestPersistence("/api/persistence?key=" + encodeURIComponent(key), { method: "DELETE" })
    .then((response) => {
      if (response.ok) dirtyKeys.delete(key);
      else {
        initialization = undefined;
        if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized;
      }
    })
    .catch(() => {
      initialization = undefined;
      if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized;
    });
}

/** Reset in-memory state in unit tests. Does not touch browser storage or the database. */
export function resetPersistenceCacheForTests(): void {
  values.clear();
  dirtyKeys.clear();
  initialization = undefined;
  revision = 0;
  if (typeof window !== "undefined") delete (window as PersistenceWindow).__speakupDatabaseInitialized;
}
