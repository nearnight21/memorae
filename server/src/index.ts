import { resolve } from 'node:path';
import { PasswordSessionAuthenticator } from './auth';
import { buildApp } from './app';
import {
  createPostgresPool,
  PostgresCipherStore,
  PostgresCosCipherStore,
  PostgresPasswordAuthStore,
} from './postgres';
import { JsonCipherStore } from './store';
import { AmapWebLocationService, type LocationService } from './location';
import {
  TencentCosObjectStore,
  type TencentCosObjectStoreOptions,
} from './tencentCos';
import type { WeChatProviderOptions } from './wechatAuth';
import { SmtpEmailSender, type EmailRegistrationOptions } from './email';

function cosOptionsFromEnvironment(): TencentCosObjectStoreOptions | null {
  const values = {
    bucket: process.env.MEMORY_RECALL_COS_BUCKET,
    region: process.env.MEMORY_RECALL_COS_REGION,
    secretId: process.env.MEMORY_RECALL_COS_SECRET_ID,
    secretKey: process.env.MEMORY_RECALL_COS_SECRET_KEY,
  };
  const configured = Object.values(values).filter((value) => value?.trim()).length;
  if (!configured) return null;
  if (configured !== 4) {
    throw new Error('腾讯云 COS 配置必须同时设置 bucket、region、secret ID 和 secret key。');
  }
  return values as TencentCosObjectStoreOptions;
}

function locationServiceFromEnvironment(): LocationService | undefined {
  const key = process.env.MEMORY_RECALL_AMAP_WEB_SERVICE_KEY?.trim();
  return key ? new AmapWebLocationService({ key }) : undefined;
}

function weChatOptionsFromEnvironment(): WeChatProviderOptions | undefined {
  const values = {
    appId: process.env.MEMORY_RECALL_WECHAT_APP_ID?.trim(),
    appSecret: process.env.MEMORY_RECALL_WECHAT_APP_SECRET?.trim(),
    callbackUrl: process.env.MEMORY_RECALL_WECHAT_CALLBACK_URL?.trim(),
    stateSecret: process.env.MEMORY_RECALL_WECHAT_STATE_SECRET?.trim(),
  };
  const configured = Object.values(values).filter(Boolean).length;
  if (!configured) return undefined;
  if (configured !== 4) {
    throw new Error('微信登录配置必须同时设置 AppID、AppSecret、回调地址和 state secret。');
  }
  if (values.stateSecret!.length < 32) {
    throw new Error('MEMORY_RECALL_WECHAT_STATE_SECRET 至少需要 32 个字符。');
  }
  return values as WeChatProviderOptions;
}

function emailOptionsFromEnvironment(codeSecret: string): EmailRegistrationOptions | undefined {
  const values = {
    host: process.env.MEMORY_RECALL_EMAIL_SMTP_HOST?.trim(),
    port: process.env.MEMORY_RECALL_EMAIL_SMTP_PORT?.trim() || '587',
    secure: process.env.MEMORY_RECALL_EMAIL_SMTP_SECURE?.trim() || '0',
    username: process.env.MEMORY_RECALL_EMAIL_SMTP_USERNAME?.trim(),
    password: process.env.MEMORY_RECALL_EMAIL_SMTP_PASSWORD,
    from: process.env.MEMORY_RECALL_EMAIL_FROM?.trim(),
  };
  const configured = [values.host, values.username, values.password, values.from]
    .filter((value) => value !== undefined && value !== '').length;
  if (!configured) return undefined;
  if (configured !== 4) {
    throw new Error('邮箱 SMTP 配置必须同时设置主机、用户名、密码和发件人。');
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MEMORY_RECALL_EMAIL_SMTP_PORT 必须是有效端口。');
  }
  if (values.secure !== '0' && values.secure !== '1') {
    throw new Error('MEMORY_RECALL_EMAIL_SMTP_SECURE 只能是 0 或 1。');
  }
  return {
    codeSecret,
    sender: new SmtpEmailSender({
      host: values.host!,
      port,
      secure: values.secure === '1',
      username: values.username!,
      password: values.password!,
      from: values.from!,
    }),
  };
}

async function main(): Promise<void> {
  const port = Number(process.env.MEMORY_RECALL_PORT ?? 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MEMORY_RECALL_PORT 必须是有效端口。');
  }
  const allowedOrigins = process.env.MEMORY_RECALL_ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const locationService = locationServiceFromEnvironment();
  const wechat = weChatOptionsFromEnvironment();
  const databaseUrl = process.env.MEMORY_RECALL_DATABASE_URL;
  if (databaseUrl) {
    const tokenPepper = process.env.MEMORY_RECALL_SESSION_TOKEN_PEPPER;
    if (!tokenPepper) {
      throw new Error('使用 PostgreSQL 时必须设置 MEMORY_RECALL_SESSION_TOKEN_PEPPER。');
    }
    if (!allowedOrigins?.length) {
      throw new Error('使用 PostgreSQL 时必须设置 MEMORY_RECALL_ALLOWED_ORIGINS。');
    }
    const email = emailOptionsFromEnvironment(tokenPepper);
    const pool = createPostgresPool(databaseUrl);
    const authStore = new PostgresPasswordAuthStore(pool);
    const cosOptions = cosOptionsFromEnvironment();
    const cosStore = cosOptions
      ? new PostgresCosCipherStore(pool, new TencentCosObjectStore(cosOptions))
      : null;
    const app = await buildApp({
      store: cosStore ?? new PostgresCipherStore(pool),
      photoTransfer: cosStore ?? undefined,
      authenticator: new PasswordSessionAuthenticator(authStore, {
        tokenPepper,
      }),
      allowedOrigins,
      locationService,
      wechat,
      email,
      emailStore: authStore,
    });
    const cleanupExpiredPhotos = async () => {
      if (!cosStore) return;
      try {
        await cosStore.cleanupExpiredUploads();
      } catch {
        process.stderr.write('照片待上传对象清理失败，将在下一周期重试。\n');
      }
    };
    void cleanupExpiredPhotos();
    const photoCleanupTimer = cosStore
      ? setInterval(() => void cleanupExpiredPhotos(), 15 * 60 * 1000)
      : null;
    photoCleanupTimer?.unref();
    app.addHook('onClose', async () => {
      if (photoCleanupTimer) clearInterval(photoCleanupTimer);
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
    locationService,
  });
  const address = await app.listen({ host: '127.0.0.1', port });
  process.stdout.write(`Memory Recall 本地密文服务已启动：${address}\n`);
}

void main();
