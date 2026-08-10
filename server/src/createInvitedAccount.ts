import { createPostgresPool, PostgresPasswordAuthStore } from './postgres';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`请先设置 ${name}。`);
  return value;
}

async function main(): Promise<void> {
  const pool = createPostgresPool(requiredEnvironment('MEMORY_RECALL_DATABASE_URL'));
  try {
    const store = new PostgresPasswordAuthStore(pool);
    const account = await store.createInvitedAccount({
      loginName: requiredEnvironment('MEMORY_RECALL_INVITED_LOGIN'),
      password: requiredEnvironment('MEMORY_RECALL_INVITED_PASSWORD'),
    });
    process.stdout.write(`已创建受邀请账号：${account.loginName} (${account.id})\n`);
  } finally {
    await pool.end();
  }
}

void main();
