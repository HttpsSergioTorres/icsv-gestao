import { readdir, readFile } from 'node:fs/promises';
import { withDatabase } from './db.mjs';

const migrations = new URL('../db/migrations/', import.meta.url);

await withDatabase(async (client) => {
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('icsv_migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS icsv_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT name FROM icsv_migrations');
    const applied = new Set(rows.map(({ name }) => name));
    const files = (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of files) {
      if (applied.has(name)) continue;
      await client.query(await readFile(new URL(name, migrations), 'utf8'));
      await client.query('INSERT INTO icsv_migrations (name) VALUES ($1)', [name]);
      console.log(`Migração aplicada: ${name}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
});
