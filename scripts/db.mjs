import { existsSync } from 'node:fs';
import { Client } from 'pg';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export async function withDatabase(work) {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL antes de executar este comando.');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
