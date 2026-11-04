import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

let pool: Pool | undefined;
let initialization: Promise<void> | undefined;

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getDatabasePool(): Pool {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL não foi configurada.");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 5_000),
    idleTimeoutMillis: 30_000,
    application_name: "mentary-backend",
  });
  return pool;
}

async function initializeDatabase(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  initialization ??= (async () => {
    const connection = await getDatabasePool().connect();
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      const migrationVersions = [
        "001_initial_postgres",
        "002_allow_duplicate_alternative_labels",
        "003_extrator_schema_and_mentary_export",
      ];
      for (const migrationVersion of migrationVersions) {
        const applied = await connection.query("SELECT version FROM schema_migrations WHERE version = $1", [migrationVersion]);
        if (applied.rowCount) continue;

        const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), `../../../../database/migrations/${migrationVersion}.sql`);
        const migration = await readFile(migrationPath, "utf8");
        await connection.query("BEGIN");
        try {
          await connection.query(migration);
          await connection.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migrationVersion]);
          await connection.query("COMMIT");
        } catch (error) {
          await connection.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      connection.release();
    }
  })();
  try {
    await initialization;
  } catch (error) {
    initialization = undefined;
    throw error;
  }
}

async function closeDatabase(): Promise<void> {
  if (!pool) return;
  const currentPool = pool;
  pool = undefined;
  initialization = undefined;
  await currentPool.end();
}

export { closeDatabase, getDatabasePool, initializeDatabase, isDatabaseConfigured };
