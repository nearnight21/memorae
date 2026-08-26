import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  InMemoryPasswordAuthStore,
  PasswordSessionAuthenticator,
} from '../src/auth.ts';
import { buildApp } from '../src/app.ts';
import type { PhotoKind, SealedBytesV1 } from '../src/contracts.ts';
import {
  PhotoTransferConflictError,
  PhotoTransferNotFoundError,
  type BeginPhotoUploadInput,
  type BeginPhotoUploadResult,
  type DirectPhotoTransfer,
  type PhotoDownloadGrant,
  type PhotoUploadGrant,
} from '../src/photoTransfer.ts';
import { JsonCipherStore } from '../src/store.ts';
import { TencentCosObjectStore } from '../src/tencentCos.ts';

const TEST_PASSWORD_HASH = {
  memoryKiB: 8 * 1024,
  iterations: 1,
  parallelism: 1,
};

const TOKEN_PEPPER = 'test-only-photo-transfer-pepper-at-least-32-chars';
const metadata: SealedBytesV1 = {
  algorithm: 'AES-256-GCM',
  iv: 'encrypted-photo-metadata-iv',
  ciphertext: 'encrypted-photo-metadata',
};
const contentSha256 = 'a'.repeat(64);

test('Tencent COS signed URLs are HTTPS and never expose the secret key', async () => {
  const secretKey = 'test-only-secret-key-never-include-in-url';
  const store = new TencentCosObjectStore({
    bucket: 'memory-recall-test-1250000000',
    region: 'ap-shanghai',
    secretId: 'AKIDTESTONLY',
    secretKey,
  });

  for (const method of ['GET', 'PUT'] as const) {
    const signedUrl = await store.createSignedUrl(
      'memory-recall/v1/account/photos/photo-001/preview/cipher.json',
      method,
      300,
    );
    const parsed = new URL(signedUrl);
    assert.equal(parsed.protocol, 'https:');
    assert.equal(parsed.hostname, 'memory-recall-test-1250000000.cos.ap-shanghai.myqcloud.com');
    assert.ok(parsed.searchParams.has('q-signature'));
    assert.equal(signedUrl.includes(secretKey), false);
  }
});

interface StoredTransfer {
  accountId: string;
  input: BeginPhotoUploadInput;
  uploadId: string;
  ready: boolean;
}

class InMemoryDirectPhotoTransfer implements DirectPhotoTransfer {
  private readonly transfers = new Map<string, StoredTransfer>();

  constructor(private readonly objectBaseUrl = 'https://cos.test') {}

  private key(accountId: string, photoId: string, kind: PhotoKind): string {
    return `${accountId}:${photoId}:${kind}`;
  }

  async beginUpload(
    accountId: string,
    input: BeginPhotoUploadInput,
  ): Promise<BeginPhotoUploadResult> {
    const key = this.key(accountId, input.id, input.kind);
    const existing = this.transfers.get(key);
    if (existing?.ready) {
      if (JSON.stringify(existing.input) === JSON.stringify(input)) {
        return { status: 'complete' };
      }
      throw new PhotoTransferConflictError('同一照片档位已经存在。');
    }
    const transfer = existing ?? {
      accountId,
      input: structuredClone(input),
      uploadId: randomUUID(),
      ready: false,
    };
    this.transfers.set(key, transfer);
    return {
      status: 'upload',
      uploadId: transfer.uploadId,
      method: 'PUT',
      url: `${this.objectBaseUrl}/objects/${encodeURIComponent(key)}`,
      headers: { 'content-type': 'application/octet-stream' },
      expiresAt: '2026-08-11T01:05:00.000Z',
    };
  }

  async completeUpload(
    accountId: string,
    photoId: string,
    kind: PhotoKind,
    uploadId: string,
  ): Promise<void> {
    const transfer = this.transfers.get(this.key(accountId, photoId, kind));
    if (!transfer || transfer.uploadId !== uploadId) {
      throw new PhotoTransferNotFoundError('找不到待完成的照片上传。');
    }
    transfer.ready = true;
  }

  async createDownload(
    accountId: string,
    photoId: string,
    kind: PhotoKind,
  ): Promise<PhotoDownloadGrant | null> {
    const transfer = this.transfers.get(this.key(accountId, photoId, kind));
    if (!transfer?.ready) return null;
    return {
      id: photoId,
      kind,
      cryptoVersion: 1,
      metadata: structuredClone(transfer.input.metadata),
      contentLength: transfer.input.contentLength,
      contentSha256: transfer.input.contentSha256,
      method: 'GET',
      url: `${this.objectBaseUrl}/objects/${encodeURIComponent(this.key(accountId, photoId, kind))}`,
      headers: {},
      expiresAt: '2026-08-11T01:05:00.000Z',
    };
  }

  async cleanupExpiredUploads(): Promise<number> {
    return 0;
  }
}

async function login(baseUrl: string, loginName: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginName, password }),
  });
  assert.equal(response.status, 200);
  return (await response.json() as { accessToken: string }).accessToken;
}

function bearer(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

test('direct photo grants validate input and stay account scoped', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-recall-photo-transfer-'));
  const authStore = new InMemoryPasswordAuthStore();
  await authStore.addAccount({
    id: 'account-alice',
    loginName: 'alice',
    password: 'alice-test-password',
    passwordHash: TEST_PASSWORD_HASH,
  });
  await authStore.addAccount({
    id: 'account-bob',
    loginName: 'bob',
    password: 'bob-test-password',
    passwordHash: TEST_PASSWORD_HASH,
  });
  const app = await buildApp({
    store: new JsonCipherStore(join(directory, 'store.json')),
    photoTransfer: new InMemoryDirectPhotoTransfer(),
    authenticator: new PasswordSessionAuthenticator(authStore, {
      tokenPepper: TOKEN_PEPPER,
      passwordHash: TEST_PASSWORD_HASH,
    }),
  });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const aliceToken = await login(baseUrl, 'alice', 'alice-test-password');
  const bobToken = await login(baseUrl, 'bob', 'bob-test-password');
  const uploadUrl = `${baseUrl}/v1/photos/photo-shared-001/preview/upload`;

  const legacyRelay = await fetch(`${baseUrl}/v1/photos/photo-shared-001`, {
    method: 'PUT',
    headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'photo-shared-001',
      cryptoVersion: 1,
      kind: 'preview',
      metadata,
      content: metadata,
    }),
  });
  assert.equal(legacyRelay.status, 404);

  assert.equal((await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cryptoVersion: 1, metadata, contentLength: 512, contentSha256 }),
  })).status, 401);

  assert.equal((await fetch(`${baseUrl}/v1/photos/photo-shared-001/unknown/upload`, {
    method: 'POST',
    headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
    body: JSON.stringify({ cryptoVersion: 1, metadata, contentLength: 512, contentSha256 }),
  })).status, 400);

  assert.equal((await fetch(uploadUrl, {
    method: 'POST',
    headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
    body: JSON.stringify({
      cryptoVersion: 1,
      metadata,
      contentLength: 512,
      contentSha256,
      filename: 'private-name.jpg',
    }),
  })).status, 400);

  const begin = await fetch(uploadUrl, {
    method: 'POST',
    headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
    body: JSON.stringify({ cryptoVersion: 1, metadata, contentLength: 512, contentSha256 }),
  });
  assert.equal(begin.status, 200);
  const grant = await begin.json() as PhotoUploadGrant;
  assert.equal(grant.status, 'upload');
  assert.equal(grant.method, 'PUT');
  assert.equal(grant.headers['content-type'], 'application/octet-stream');
  assert.match(grant.uploadId, /^[0-9a-f-]{36}$/);

  const bobBeforeComplete = await fetch(
    `${baseUrl}/v1/photos/photo-shared-001/preview/download`,
    { headers: bearer(bobToken) },
  );
  assert.equal(bobBeforeComplete.status, 404);

  const wrongComplete = await fetch(
    `${baseUrl}/v1/photos/photo-shared-001/preview/complete`,
    {
      method: 'POST',
      headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
      body: JSON.stringify({ uploadId: randomUUID() }),
    },
  );
  assert.equal(wrongComplete.status, 404);

  const complete = await fetch(
    `${baseUrl}/v1/photos/photo-shared-001/preview/complete`,
    {
      method: 'POST',
      headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
      body: JSON.stringify({ uploadId: grant.uploadId }),
    },
  );
  assert.equal(complete.status, 204);

  const aliceDownload = await fetch(
    `${baseUrl}/v1/photos/photo-shared-001/preview/download`,
    { headers: bearer(aliceToken) },
  );
  assert.equal(aliceDownload.status, 200);
  assert.deepEqual(await aliceDownload.json(), {
    id: 'photo-shared-001',
    kind: 'preview',
    cryptoVersion: 1,
    metadata,
    contentLength: 512,
    contentSha256,
    method: 'GET',
    url: 'https://cos.test/objects/account-alice%3Aphoto-shared-001%3Apreview',
    headers: {},
    expiresAt: '2026-08-11T01:05:00.000Z',
  });

  const repeated = await fetch(uploadUrl, {
    method: 'POST',
    headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
    body: JSON.stringify({ cryptoVersion: 1, metadata, contentLength: 512, contentSha256 }),
  });
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { status: 'complete' });
});

test('Android and Web clients exchange photo variants without sending bearer tokens to object storage', async (context) => {
  const objects = new Map<string, string>();
  const objectAuthorizations: Array<string | undefined> = [];
  const objectServer = createServer((request, response) => {
    void (async () => {
      const key = request.url ?? '/';
      objectAuthorizations.push(request.headers.authorization);
      if (request.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        objects.set(key, Buffer.concat(chunks).toString('utf8'));
        response.writeHead(200).end();
        return;
      }
      if (request.method === 'GET') {
        const content = objects.get(key);
        if (content === undefined) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(content);
        return;
      }
      response.writeHead(405).end();
    })().catch(() => response.writeHead(500).end());
  });
  await new Promise<void>((resolve) => objectServer.listen(0, '127.0.0.1', resolve));
  const objectAddress = objectServer.address();
  if (!objectAddress || typeof objectAddress === 'string') {
    throw new Error('测试对象服务没有获得端口。');
  }
  const objectBaseUrl = `http://127.0.0.1:${objectAddress.port}`;

  const directory = await mkdtemp(join(tmpdir(), 'memory-recall-client-transfer-'));
  const app = await buildApp({
    store: new JsonCipherStore(join(directory, 'store.json')),
    photoTransfer: new InMemoryDirectPhotoTransfer(objectBaseUrl),
    localToken: 'client-direct-test-token-at-least-16-chars',
  });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  context.after(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) => objectServer.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });

  const androidClientPath = '../../../../memory-recall-mobile/src/sync/syncClient.ts';
  const webClientPath = '../../web/src/sync/syncClient.ts';
  const androidModule = await import(androidClientPath);
  const webModule = await import(webClientPath);
  const token = 'client-direct-test-token-at-least-16-chars';
  const android = new androidModule.MemoryRecallSyncClient({
    baseUrl,
    token,
    sha256Hex: async (value: string) => createHash('sha256').update(value).digest('hex'),
  });
  const web = new webModule.MemoryRecallSyncClient({ baseUrl, token });

  const androidPhoto = {
    id: 'android-direct-preview',
    cryptoVersion: 1 as const,
    kind: 'preview' as const,
    metadata,
    content: {
      algorithm: 'AES-256-GCM' as const,
      iv: 'android-direct-content-iv',
      ciphertext: 'android-direct-content-ciphertext',
    },
  };
  await android.putPhotoVariant(androidPhoto);
  await android.putPhotoVariant(androidPhoto);
  assert.deepEqual(await web.getPhotoVariant(androidPhoto.id, androidPhoto.kind), androidPhoto);

  const webPhoto = {
    ...androidPhoto,
    id: 'web-direct-thumbnail',
    kind: 'thumbnail' as const,
    content: {
      ...androidPhoto.content,
      iv: 'web-direct-content-iv',
      ciphertext: 'web-direct-content-ciphertext',
    },
  };
  await web.putPhotoVariant(webPhoto);
  assert.deepEqual(await android.getPhotoVariant(webPhoto.id, webPhoto.kind), webPhoto);
  assert.deepEqual(objectAuthorizations, [undefined, undefined, undefined, undefined]);
});
