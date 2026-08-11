import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Pool } from 'pg';
import {
  PasswordSessionAuthenticator,
} from '../src/auth.ts';
import { buildApp } from '../src/app.ts';
import type { EncryptedMemoryV1, EncryptedPhotoV1, VaultEnvelopeV1 } from '../src/contracts.ts';
import { applyMigrations } from '../src/migrations.ts';
import {
  PhotoObjectNotFoundError,
  type DirectPhotoObjectStore,
} from '../src/photoObjectStore.ts';
import {
  PostgresCipherStore,
  PostgresCosCipherStore,
  PostgresPasswordAuthStore,
} from '../src/postgres.ts';

const databaseUrl = process.env.MEMORY_RECALL_TEST_DATABASE_URL;

const TEST_PASSWORD_HASH = {
  memoryKiB: 8 * 1024,
  iterations: 1,
  parallelism: 1,
};

const TOKEN_PEPPER = 'test-only-session-token-pepper-at-least-32-chars';

const vault: VaultEnvelopeV1 = {
  schema: 'memory-recall-vault',
  cryptoVersion: 1,
  createdAt: '2026-08-10T16:00:00.000Z',
  kdf: {
    name: 'Argon2id',
    salt: 'encrypted-vault-kdf-salt',
    memoryKiB: 8192,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
  },
  wrappedVmk: { algorithm: 'AES-256-GCM', iv: 'vault-iv', ciphertext: 'vault-data' },
  wrappedKeys: {
    text: { algorithm: 'AES-256-GCM', iv: 'text-iv', ciphertext: 'text-data' },
    photo: { algorithm: 'AES-256-GCM', iv: 'photo-iv', ciphertext: 'photo-data' },
  },
};

const androidMemory: EncryptedMemoryV1 = {
  id: 'android-memory-001',
  version: 1,
  cryptoVersion: 1,
  deleted: false,
  payload: { algorithm: 'AES-256-GCM', iv: 'android-memory-iv', ciphertext: 'android-memory-ciphertext' },
};

const webMemory: EncryptedMemoryV1 = {
  id: 'web-memory-001',
  version: 1,
  cryptoVersion: 1,
  deleted: false,
  payload: { algorithm: 'AES-256-GCM', iv: 'web-memory-iv', ciphertext: 'web-memory-ciphertext' },
};

const androidPhoto: EncryptedPhotoV1 = {
  id: 'android-photo-001',
  cryptoVersion: 1,
  kind: 'original',
  metadata: { algorithm: 'AES-256-GCM', iv: 'android-metadata-iv', ciphertext: 'android-metadata-ciphertext' },
  content: { algorithm: 'AES-256-GCM', iv: 'android-content-iv', ciphertext: 'android-content-ciphertext' },
};

class InMemoryPhotoObjectStore implements DirectPhotoObjectStore {
  readonly objects = new Map<string, string>();
  readonly signedRequests: Array<{ key: string; method: 'GET' | 'PUT' }> = [];
  beforeDelete?: (key: string) => Promise<void>;

  async putObject(key: string, content: string): Promise<void> {
    this.objects.set(key, content);
  }

  async getObject(key: string): Promise<string> {
    const content = this.objects.get(key);
    if (!content) throw new Error('测试对象不存在。');
    return content;
  }

  async deleteObject(key: string): Promise<void> {
    await this.beforeDelete?.(key);
    this.objects.delete(key);
  }

  async createSignedUrl(
    key: string,
    method: 'GET' | 'PUT',
    _expiresInSeconds: number,
  ): Promise<string> {
    this.signedRequests.push({ key, method });
    return `https://cos.test/${encodeURIComponent(key)}?method=${method}`;
  }

  async headObject(key: string): Promise<{ contentLength: number; etag: string }> {
    const content = this.objects.get(key);
    if (content === undefined) throw new PhotoObjectNotFoundError();
    return {
      contentLength: Buffer.byteLength(content, 'utf8'),
      etag: `etag-${Buffer.byteLength(content, 'utf8')}`,
    };
  }
}

function bearer(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

async function login(baseUrl: string, loginName: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginName, password, deviceId: `${loginName}-device` }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { accessToken: string; expiresAt: string };
  assert.match(body.accessToken, /^[A-Za-z0-9_-]+$/);
  return body.accessToken;
}

if (!databaseUrl) {
  test('PostgreSQL integration (set MEMORY_RECALL_TEST_DATABASE_URL to run)', {
    skip: '未设置 MEMORY_RECALL_TEST_DATABASE_URL。',
  }, () => undefined);
} else {
  test('photo migrations preserve legacy database and COS photos', async (context) => {
    const schema = `memory_recall_upgrade_${randomUUID().replaceAll('-', '')}`;
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`SET search_path TO "${schema}", public`);
    context.after(async () => {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
    });

    const migration001 = await readFile(
      new URL('../migrations/001_initial.sql', import.meta.url),
      'utf8',
    );
    const migration002 = await readFile(
      new URL('../migrations/002_photo_cos_reference.sql', import.meta.url),
      'utf8',
    );
    await pool.query(migration001);
    await pool.query(migration002);
    await pool.query(
      `CREATE TABLE schema_migrations (
         name TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    );
    await pool.query(
      `INSERT INTO schema_migrations (name)
       VALUES ('001_initial.sql'), ('002_photo_cos_reference.sql')`,
    );

    const accountId = randomUUID();
    const legacyDatabasePhoto: EncryptedPhotoV1 = {
      ...androidPhoto,
      id: 'legacy-database-photo',
    };
    await pool.query(
      `INSERT INTO accounts (id, login_name, password_hash)
       VALUES ($1::uuid, 'legacy-account', 'test-only-password-hash')`,
      [accountId],
    );
    await pool.query(
      `INSERT INTO photo_ciphers (
         account_id, photo_id, crypto_version, payload_json
       ) VALUES ($1::uuid, $2, 1, $3::jsonb)`,
      [accountId, legacyDatabasePhoto.id, JSON.stringify(legacyDatabasePhoto)],
    );
    await pool.query(
      `INSERT INTO photo_ciphers (
         account_id, photo_id, crypto_version, payload_json,
         storage_kind, object_key, photo_kind, metadata_json
       ) VALUES (
         $1::uuid, 'legacy-cos-photo', 1, NULL,
         'cos', 'legacy/cipher.json', 'thumbnail', $2::jsonb
       )`,
      [accountId, JSON.stringify(androidPhoto.metadata)],
    );

    assert.deepEqual(await applyMigrations(pool), [
      '003_direct_photo_variants.sql',
      '004_photo_content_digest.sql',
    ]);

    const upgraded = await pool.query<{
      photo_id: string;
      photo_kind: string;
      storage_kind: string | null;
      transfer_status: string | null;
    }>(
      `SELECT photo_id, photo_kind, storage_kind, transfer_status
       FROM photo_ciphers
       ORDER BY photo_id`,
    );
    assert.deepEqual(upgraded.rows, [
      {
        photo_id: 'legacy-cos-photo',
        photo_kind: 'thumbnail',
        storage_kind: 'cos',
        transfer_status: 'ready',
      },
      {
        photo_id: 'legacy-database-photo',
        photo_kind: 'original',
        storage_kind: null,
        transfer_status: null,
      },
    ]);
    assert.deepEqual(
      await new PostgresCipherStore(pool).getPhoto(accountId, legacyDatabasePhoto.id),
      legacyDatabasePhoto,
    );

    const previewPhoto: EncryptedPhotoV1 = {
      ...legacyDatabasePhoto,
      kind: 'preview',
    };
    await new PostgresCipherStore(pool).putPhoto(accountId, previewPhoto);
    const variants = await pool.query<{ photo_kind: string }>(
      `SELECT photo_kind
       FROM photo_ciphers
       WHERE account_id = $1::uuid AND photo_id = $2
       ORDER BY photo_kind`,
      [accountId, legacyDatabasePhoto.id],
    );
    assert.deepEqual(variants.rows, [
      { photo_kind: 'original' },
      { photo_kind: 'preview' },
    ]);
  });

  test('PostgreSQL stores sessions and account-scoped ciphertext', async (context) => {
    const schema = `memory_recall_test_${randomUUID().replaceAll('-', '')}`;
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`SET search_path TO "${schema}", public`);
    await applyMigrations(pool);

    const authStore = new PostgresPasswordAuthStore(pool);
    const alice = await authStore.createInvitedAccount({
      loginName: 'Alice',
      password: 'alice-test-password',
      passwordHash: TEST_PASSWORD_HASH,
    });
    const bob = await authStore.createInvitedAccount({
      loginName: 'Bob',
      password: 'bob-test-password',
      passwordHash: TEST_PASSWORD_HASH,
    });
    let now = new Date('2026-08-11T00:00:00.000Z');
    const app = await buildApp({
      store: new PostgresCipherStore(pool),
      authenticator: new PasswordSessionAuthenticator(authStore, {
        tokenPepper: TOKEN_PEPPER,
        sessionTtlMs: 1000,
        passwordHash: TEST_PASSWORD_HASH,
        now: () => now,
      }),
    });
    const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });

    context.after(async () => {
      await app.close();
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
    });

    const aliceToken = await login(baseUrl, 'alice', 'alice-test-password');
    const bobToken = await login(baseUrl, 'bob', 'bob-test-password');

    const putVault = await fetch(`${baseUrl}/v1/vault`, {
      method: 'PUT',
      headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
      body: JSON.stringify(vault),
    });
    assert.equal(putVault.status, 204);
    const bobVault = await fetch(`${baseUrl}/v1/vault`, { headers: bearer(bobToken) });
    assert.equal(bobVault.status, 404);
    const aliceVault = await fetch(`${baseUrl}/v1/vault`, { headers: bearer(aliceToken) });
    assert.deepEqual(await aliceVault.json(), vault);

    const androidUpload = await fetch(`${baseUrl}/v1/memories/${androidMemory.id}`, {
      method: 'PUT',
      headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
      body: JSON.stringify(androidMemory),
    });
    assert.equal(androidUpload.status, 204);
    const reorderedUpload = await fetch(`${baseUrl}/v1/memories/${androidMemory.id}`, {
      method: 'PUT',
      headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        payload: androidMemory.payload,
        deleted: androidMemory.deleted,
        cryptoVersion: androidMemory.cryptoVersion,
        version: androidMemory.version,
        id: androidMemory.id,
      }),
    });
    assert.equal(reorderedUpload.status, 204);
    const changedUpload = await fetch(`${baseUrl}/v1/memories/${androidMemory.id}`, {
      method: 'PUT',
      headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        ...androidMemory,
        payload: { ...androidMemory.payload, ciphertext: 'different-ciphertext' },
      }),
    });
    assert.equal(changedUpload.status, 409);

    const webUpload = await fetch(`${baseUrl}/v1/memories/${webMemory.id}`, {
      method: 'PUT',
      headers: { ...bearer(bobToken), 'content-type': 'application/json' },
      body: JSON.stringify(webMemory),
    });
    assert.equal(webUpload.status, 204);
    const aliceMemories = await fetch(`${baseUrl}/v1/memories`, { headers: bearer(aliceToken) });
    assert.deepEqual(await aliceMemories.json(), { items: [androidMemory] });
    const bobMemories = await fetch(`${baseUrl}/v1/memories`, { headers: bearer(bobToken) });
    assert.deepEqual(await bobMemories.json(), { items: [webMemory] });

    const photoUpload = await fetch(`${baseUrl}/v1/photos/${androidPhoto.id}`, {
      method: 'PUT',
      headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
      body: JSON.stringify(androidPhoto),
    });
    assert.equal(photoUpload.status, 204);
    const photoRead = await fetch(`${baseUrl}/v1/photos/${androidPhoto.id}`, {
      headers: bearer(aliceToken),
    });
    assert.deepEqual(await photoRead.json(), androidPhoto);
    const changedPhoto = await fetch(`${baseUrl}/v1/photos/${androidPhoto.id}`, {
      method: 'PUT',
      headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        ...androidPhoto,
        content: { ...androidPhoto.content, ciphertext: 'different-photo-ciphertext' },
      }),
    });
    assert.equal(changedPhoto.status, 409);

    const cosObjectStore = new InMemoryPhotoObjectStore();
    const cosStore = new PostgresCosCipherStore(pool, cosObjectStore, {
      now: () => now,
      signedUrlTtlSeconds: 300,
      pendingUploadTtlMs: 60_000,
    });
    const cosPhoto: EncryptedPhotoV1 = {
      ...androidPhoto,
      id: 'cos-photo-001',
      content: { ...androidPhoto.content, ciphertext: 'cos-content-ciphertext' },
    };
    await cosStore.putPhoto(alice.id, cosPhoto);
    await cosStore.putPhoto(alice.id, cosPhoto);
    assert.deepEqual(await cosStore.getPhoto(alice.id, cosPhoto.id), cosPhoto);
    assert.equal(cosObjectStore.objects.size, 1);
    assert.equal(await cosStore.getPhoto(bob.id, cosPhoto.id), null);
    const cosRow = await pool.query<{ payload_json: unknown; metadata_json: unknown }>(
      `SELECT payload_json, metadata_json
       FROM photo_ciphers
       WHERE account_id = $1::uuid AND photo_id = $2`,
      [alice.id, cosPhoto.id],
    );
    assert.equal(JSON.stringify(cosRow.rows[0]).includes(cosPhoto.content.ciphertext), false);
    await assert.rejects(
      cosStore.putPhoto(alice.id, {
        ...cosPhoto,
        content: { ...cosPhoto.content, ciphertext: 'different-cos-content' },
      }),
      /同一照片 ID/,
    );

    const directPhotoId = 'direct-photo-001';
    for (const kind of ['thumbnail', 'preview', 'original'] as const) {
      const directContent = JSON.stringify({
        algorithm: 'AES-256-GCM',
        iv: `${kind}-content-iv`,
        ciphertext: `${kind}-content-ciphertext`,
      });
      const contentSha256 = createHash('sha256').update(directContent).digest('hex');
      const upload = await cosStore.beginUpload(alice.id, {
        id: directPhotoId,
        kind,
        cryptoVersion: 1,
        metadata: {
          algorithm: 'AES-256-GCM',
          iv: `${kind}-metadata-iv`,
          ciphertext: `${kind}-metadata-ciphertext`,
        },
        contentLength: Buffer.byteLength(directContent, 'utf8'),
        contentSha256,
      });
      assert.equal(upload.status, 'upload');
      if (upload.status !== 'upload') throw new Error('测试应获得上传授权。');
      assert.equal(upload.method, 'PUT');
      assert.equal(upload.headers['content-type'], 'application/octet-stream');
      const signedPut = cosObjectStore.signedRequests.at(-1);
      assert.equal(signedPut?.method, 'PUT');
      assert.ok(signedPut?.key.includes(`/${kind}/`));
      cosObjectStore.objects.set(signedPut!.key, directContent);
      await cosStore.completeUpload(alice.id, directPhotoId, kind, upload.uploadId);

      const download = await cosStore.createDownload(alice.id, directPhotoId, kind);
      assert.ok(download);
      assert.equal(download.kind, kind);
      assert.equal(download.contentLength, Buffer.byteLength(directContent, 'utf8'));
      assert.equal(download.contentSha256, contentSha256);
      assert.equal(cosObjectStore.signedRequests.at(-1)?.method, 'GET');
      assert.equal(await cosStore.createDownload(bob.id, directPhotoId, kind), null);
      assert.deepEqual(await cosStore.beginUpload(alice.id, {
        id: directPhotoId,
        kind,
        cryptoVersion: 1,
        metadata: download.metadata,
        contentLength: download.contentLength,
        contentSha256,
      }), { status: 'complete' });
    }
    const directRows = await pool.query<{ photo_kind: string; transfer_status: string }>(
      `SELECT photo_kind, transfer_status
       FROM photo_ciphers
       WHERE account_id = $1::uuid AND photo_id = $2
       ORDER BY photo_kind`,
      [alice.id, directPhotoId],
    );
    assert.deepEqual(directRows.rows, [
      { photo_kind: 'original', transfer_status: 'ready' },
      { photo_kind: 'preview', transfer_status: 'ready' },
      { photo_kind: 'thumbnail', transfer_status: 'ready' },
    ]);
    assert.equal((await cosStore.getPhoto(alice.id, directPhotoId))?.kind, 'original');

    const incorrectLengthUpload = await cosStore.beginUpload(alice.id, {
      id: 'incorrect-length-photo',
      kind: 'preview',
      cryptoVersion: 1,
      metadata: androidPhoto.metadata,
      contentLength: 128,
      contentSha256: 'b'.repeat(64),
    });
    if (incorrectLengthUpload.status !== 'upload') {
      throw new Error('测试应获得上传授权。');
    }
    const incorrectLengthKey = cosObjectStore.signedRequests.at(-1)?.key;
    assert.ok(incorrectLengthKey);
    cosObjectStore.objects.set(incorrectLengthKey, 'too-short');
    await assert.rejects(
      cosStore.completeUpload(
        alice.id,
        'incorrect-length-photo',
        'preview',
        incorrectLengthUpload.uploadId,
      ),
      /长度与申请不一致/,
    );

    now = new Date('2026-08-11T00:00:01.001Z');
    const expired = await fetch(`${baseUrl}/v1/memories`, { headers: bearer(aliceToken) });
    assert.equal(expired.status, 401);

    now = new Date('2026-08-11T00:00:02.000Z');
    const revocableToken = await login(baseUrl, 'alice', 'alice-test-password');
    const logout = await fetch(`${baseUrl}/v1/auth/logout`, {
      method: 'POST',
      headers: bearer(revocableToken),
    });
    assert.equal(logout.status, 204);
    const revoked = await fetch(`${baseUrl}/v1/memories`, { headers: bearer(revocableToken) });
    assert.equal(revoked.status, 401);

    now = new Date('2026-08-11T00:02:00.000Z');
    let pendingRowRemovedBeforeObjectCleanup = false;
    cosObjectStore.beforeDelete = async () => {
      const pendingRow = await pool.query(
        `SELECT 1 FROM photo_ciphers
         WHERE account_id = $1::uuid AND photo_id = 'incorrect-length-photo'`,
        [alice.id],
      );
      pendingRowRemovedBeforeObjectCleanup = pendingRow.rowCount === 0;
    };
    assert.equal(await cosStore.cleanupExpiredUploads(), 1);
    assert.equal(pendingRowRemovedBeforeObjectCleanup, true);
    const expiredRow = await pool.query(
      `SELECT 1 FROM photo_ciphers
       WHERE account_id = $1::uuid AND photo_id = 'incorrect-length-photo'`,
      [alice.id],
    );
    assert.equal(expiredRow.rowCount, 0);
  });
}
