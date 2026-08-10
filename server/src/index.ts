import { resolve } from 'node:path';
import { buildApp } from './app';
import { JsonCipherStore } from './store';

async function main(): Promise<void> {
  const localToken = process.env.MEMORY_RECALL_LOCAL_TOKEN;
  if (!localToken) {
    throw new Error('请先设置 MEMORY_RECALL_LOCAL_TOKEN。');
  }

  const port = Number(process.env.MEMORY_RECALL_PORT ?? 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MEMORY_RECALL_PORT 必须是有效端口。');
  }

  const filePath = resolve(
    process.cwd(),
    process.env.MEMORY_RECALL_DATA_FILE ?? '.local-data/store.json',
  );
  const app = await buildApp({
    store: new JsonCipherStore(filePath),
    localToken,
  });
  const address = await app.listen({ host: '127.0.0.1', port });
  process.stdout.write(`Memory Recall 本地密文服务已启动：${address}\n`);
}

void main();
