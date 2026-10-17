import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const globalForDatabase = globalThis as typeof globalThis & {
  speakupDatabase?: Database.Database;
};

export function getDatabasePath(): string {
  const configuredPath = process.env.SQLITE_DATABASE_PATH;
  return configuredPath
    ? path.resolve(configuredPath)
    : path.join(process.cwd(), "data", "speakup.sqlite");
}

export function getDatabase(): Database.Database {
  if (!globalForDatabase.speakupDatabase) {
    const databasePath = getDatabasePath();

    mkdirSync(path.dirname(databasePath), { recursive: true });
    const database = new Database(databasePath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    globalForDatabase.speakupDatabase = database;
  }

  return globalForDatabase.speakupDatabase;
}

type Migration = {
  name: string;
  sql: string;
  checksum: string;
};

function loadMigrations(): Migration[] {
  const migrationDirectory = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right));

  if (files.length === 0) {
    throw new Error(`No SQL migrations were found in ${migrationDirectory}.`);
  }

  return files.map((name) => {
    const sql = readFileSync(path.join(migrationDirectory, name), "utf8");
    if (!sql.trim()) throw new Error(`Migration ${name} is empty.`);
    return {
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  });
}

/**
 * Apply the repository's numbered SQLite migrations exactly once.
 *
 * Each migration and its ledger entry are committed atomically. Checksums make
 * accidental edits to already-applied migrations fail loudly; schema changes
 * should be added as a new migration instead.
 */
export function ensurePersistenceSchema(): void {
  const database = getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const migrations = loadMigrations();
  const appliedMigrations = database
    .prepare("SELECT migration_name AS name, checksum FROM schema_migrations")
    .all() as Array<{ name: string; checksum: string }>;
  const appliedByName = new Map(appliedMigrations.map((migration) => [migration.name, migration.checksum]));

  for (const migration of migrations) {
    const appliedChecksum = appliedByName.get(migration.name);
    if (appliedChecksum) {
      if (appliedChecksum !== migration.checksum) {
        throw new Error(
          `Applied migration ${migration.name} has changed. Add a new migration instead of editing an applied migration.`,
        );
      }
      continue;
    }

    const applyMigration = database.transaction(() => {
      database.exec(migration.sql);
      database.prepare(
        "INSERT INTO schema_migrations (migration_name, checksum) VALUES (?, ?)",
      ).run(migration.name, migration.checksum);
    });
    applyMigration();
  }
}
