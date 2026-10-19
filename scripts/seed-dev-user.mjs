import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

if (process.env.NODE_ENV === "production") {
  throw new Error("The development-user seeder cannot run in production.");
}

// Node does not automatically load .env.local for scripts, so read only the
// local file and never overwrite values already supplied by the environment.
const localEnvPath = path.join(process.cwd(), ".env.local");
if (existsSync(localEnvPath)) {
  for (const line of readFileSync(localEnvPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

const email = (process.env.DEV_USER_EMAIL || "umarkhan@speakup.local").trim().toLowerCase();
const password = process.env.DEV_USER_PASSWORD || "umarkhan";
const displayName = (process.env.DEV_USER_NAME || "Umar Khan").trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("DEV_USER_EMAIL must be a valid email address.");
}
if (password.length < 1 || password.length > 128) {
  throw new Error("DEV_USER_PASSWORD must contain between 1 and 128 characters.");
}
if (displayName.length < 2 || displayName.length > 60) {
  throw new Error("DEV_USER_NAME must contain between 2 and 60 characters.");
}

const configuredPath = process.env.SQLITE_DATABASE_PATH;
const databasePath = configuredPath
  ? path.resolve(configuredPath)
  : path.join(process.cwd(), "data", "speakup.sqlite");
mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
try {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const migrationDirectory = path.join(process.cwd(), "db", "migrations");
  const migrations = readdirSync(migrationDirectory)
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right));

  if (migrations.length === 0) {
    throw new Error(`No SQL migrations were found in ${migrationDirectory}.`);
  }

  for (const name of migrations) {
    const sql = readFileSync(path.join(migrationDirectory, name), "utf8");
    if (!sql.trim()) throw new Error(`Migration ${name} is empty.`);
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = database.prepare(
      "SELECT checksum FROM schema_migrations WHERE migration_name = ?",
    ).get(name);

    if (applied) {
      if (applied.checksum !== checksum) {
        throw new Error(`Applied migration ${name} has changed; add a new migration instead.`);
      }
      continue;
    }

    database.transaction(() => {
      database.exec(sql);
      database.prepare(
        "INSERT INTO schema_migrations (migration_name, checksum) VALUES (?, ?)",
      ).run(name, checksum);
    })();
  }

  const existing = database.prepare(
    "SELECT email FROM learner_accounts WHERE email = ? COLLATE NOCASE",
  ).get(email);

  if (existing) {
    console.log(`Development login already exists: ${email}`);
    console.log("Its password was left unchanged.");
  } else {
    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync(password, salt, 64).toString("hex");
    database.prepare(`
      INSERT INTO learner_accounts
        (id, email, display_name, password_salt, password_hash, owner_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), email, displayName, salt, passwordHash, randomUUID());

    console.log(`Created development login: ${email}`);
  }

  console.log("Open http://localhost:3000/login to sign in.");
  if (!process.env.DEV_USER_PASSWORD) {
    console.log("Local-only default username/password: umarkhan / umarkhan");
    console.log("Set DEV_USER_EMAIL, DEV_USER_PASSWORD, and DEV_USER_NAME in .env.local to customize it.");
  }
} finally {
  database.close();
}
