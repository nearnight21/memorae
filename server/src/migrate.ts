import { applyMigrations } from './migrations';
import { createPostgresPool } from './postgres';

async function main(): Promise<void> {
  const databaseUrl = process.env.MEMORY_RECALL_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('请先设置 MEMORY_RECALL_DATABASE_URL。');
  }
  const pool = createPostgresPool(databaseUrl);
  try {
    const applied = await applyMigrations(pool);
    process.stdout.write(
      applied.length
        ? `已应用数据库迁移：${applied.join(', ')}\n`
        : '数据库迁移已经是最新状态。\n',
    );
  } finally {
    await pool.end();
  }
}

void main();
