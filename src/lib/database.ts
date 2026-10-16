import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const globalForDatabase = globalThis as typeof globalThis & {
  speakupDatabase?: Database.Database;
};

export function getDatabase(): Database.Database {
  if (!globalForDatabase.speakupDatabase) {
    const configuredPath = process.env.SQLITE_DATABASE_PATH;
    const databasePath = configuredPath
      ? path.resolve(configuredPath)
      : path.join(process.cwd(), "data", "speakup.sqlite");

    mkdirSync(path.dirname(databasePath), { recursive: true });
    const database = new Database(databasePath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    globalForDatabase.speakupDatabase = database;
  }

  return globalForDatabase.speakupDatabase;
}

let schemaReady = false;

export function ensurePersistenceSchema(): void {
  if (schemaReady) return;

  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS app_user_data (
      owner_id TEXT NOT NULL,
      data_key TEXT NOT NULL,
      data_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (owner_id, data_key)
    );
    CREATE INDEX IF NOT EXISTS idx_app_user_data_owner
      ON app_user_data(owner_id);
  `);

  schemaReady = true;
}
