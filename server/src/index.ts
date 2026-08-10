import { resolve } from 'node:path';
import { PasswordSessionAuthenticator } from './auth';
import { buildApp } from './app';
import {
  createPostgresPool,
  PostgresCipherStore,
  PostgresPasswordAuthStore,
} from './postgres';
import { JsonCipherStore } from './store';

async function main(): Promise<void> {
  const port = Number(process.env.MEMORY_RECALL_PORT ?? 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MEMORY_RECALL_PORT 必须是有效端口。');
  }
  const allowedOrigins = process.env.MEMORY_RECALL_ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const databaseUrl = process.env.MEMORY_RECALL_DATABASE_URL;
  if (databaseUrl) {
    const tokenPepper = process.env.MEMORY_RECALL_SESSION_TOKEN_PEPPER;
    if (!tokenPepper) {
      throw new Error('使用 PostgreSQL 时必须设置 MEMORY_RECALL_SESSION_TOKEN_PEPPER。');
    }
    if (!allowedOrigins?.length) {
      throw new Error('使用 PostgreSQL 时必须设置 MEMORY_RECALL_ALLOWED_ORIGINS。');
    }
    const pool = createPostgresPool(databaseUrl);
    const app = await buildApp({
      store: new PostgresCipherStore(pool),
      authenticator: new PasswordSessionAuthenticator(new PostgresPasswordAuthStore(pool), {
        tokenPepper,
      }),
      allowedOrigins,
    });
    app.addHook('onClose', async () => {
      await pool.end();
    });
    const host = process.env.MEMORY_RECALL_LISTEN_HOST ?? '0.0.0.0';
    const address = await app.listen({ host, port });
    process.stdout.write(`Memory Recall PostgreSQL 密文服务已启动：${address}\n`);
    return;
  }

  const localToken = process.env.MEMORY_RECALL_LOCAL_TOKEN;
  if (!localToken) {
    throw new Error('请先设置 MEMORY_RECALL_LOCAL_TOKEN，或配置 PostgreSQL 环境变量。');
  }
  const filePath = resolve(
    process.cwd(),
    process.env.MEMORY_RECALL_DATA_FILE ?? '.local-data/store.json',
  );
  const app = await buildApp({
    store: new JsonCipherStore(filePath),
    localToken,
    allowedOrigins,
  });
  const address = await app.listen({ host: '127.0.0.1', port });
  process.stdout.write(`Memory Recall 本地密文服务已启动：${address}\n`);
}

void main();
