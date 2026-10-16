import { Pool } from "pg";

const globalForDatabase = globalThis as typeof globalThis & { speakupPool?: Pool };

export function getDatabasePool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Add a PostgreSQL connection string to the server environment.");
  }
  if (!globalForDatabase.speakupPool) {
    globalForDatabase.speakupPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForDatabase.speakupPool;
}

let schemaReady: Promise<void> | undefined;

export function ensurePersistenceSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getDatabasePool().query(`
      CREATE TABLE IF NOT EXISTS app_user_data (
        owner_id UUID NOT NULL,
        data_key TEXT NOT NULL,
        data_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (owner_id, data_key)
      )
    `).then(() => undefined).catch((error: unknown) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}
