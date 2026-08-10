import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const defaultMigrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrationLockId = 740_981_023;

export async function applyMigrations(
  pool: Pool,
  migrationDirectory = defaultMigrationDirectory,
): Promise<string[]> {
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    );
    for (const name of names) {
      const alreadyApplied = await client.query<{ name: string }>(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (alreadyApplied.rowCount) continue;

      const sql = await readFile(`${migrationDirectory}/${name}`, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        applied.push(name);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
    client.release();
  }
  return applied;
}
