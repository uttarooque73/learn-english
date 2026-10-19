import type Database from "better-sqlite3";

const EXCLUDED_TABLES = new Set(["learner_accounts", "schema_migrations", "auth_login_attempts"]);
const PRIVATE_COLUMN = /password|passphrase|secret|token|credential|salt|hash|api[_-]?key/i;
const MAX_ROWS_PER_TABLE = 10_000;

function isSafeIdentifier(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "owner_id" && !PRIVATE_COLUMN.test(key)),
  );
}

/** Export only learning tables belonging to one owner, never authentication secrets. */
export function collectLearningData(database: Database.Database, ownerId: string) {
  const tables = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;

  const learningData: Record<string, { records: Record<string, unknown>[]; truncated: boolean }> = {};
  for (const { name } of tables) {
    if (!isSafeIdentifier(name) || EXCLUDED_TABLES.has(name) || /auth|credential|password|token/i.test(name)) continue;
    const columns = database.prepare(`PRAGMA table_info("${name}")`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "owner_id")) continue;

    const rows = database.prepare(`SELECT * FROM "${name}" WHERE owner_id = ? LIMIT ?`).all(ownerId, MAX_ROWS_PER_TABLE) as Array<Record<string, unknown>>;
    if (rows.length > 0) {
      learningData[name] = {
        records: rows.map(sanitizeRow),
        truncated: rows.length === MAX_ROWS_PER_TABLE,
      };
    }
  }
  return learningData;
}
