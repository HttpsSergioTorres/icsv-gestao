import { Pool, type PoolClient } from "pg";

const globalDatabase = globalThis as typeof globalThis & { icsvPool?: Pool };

export function database() {
  if (globalDatabase.icsvPool) return globalDatabase.icsvPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");

  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000, max: 10 });
  pool.on("error", (error: Error) => console.error("Erro em conexão do PostgreSQL:", error.name));
  globalDatabase.icsvPool = pool;
  return pool;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function recordTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  return transaction(async (client) => {
    // Keep account and record changes consistent with checks spanning multiple records.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('icsv_record_mutations'))");
    return work(client);
  });
}
