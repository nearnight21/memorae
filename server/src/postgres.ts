import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Pool } from 'pg';
import type {
  NewStoredSession,
  PasswordAccount,
  PasswordAuthStore,
  PasswordHashOptions,
  StoredSession,
} from './auth';
import { hashPassword } from './auth';
import type {
  EncryptedMemoryV1,
  EncryptedPhotoV1,
  PhotoKind,
  SealedBytesV1,
  VaultEnvelopeV1,
} from './contracts';
import {
  PhotoObjectNotFoundError,
  type DirectPhotoObjectStore,
} from './photoObjectStore';
import {
  DEFAULT_PENDING_UPLOAD_TTL_MS,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  FROZEN_PHOTO_TRANSFER_LIMITS,
  PHOTO_CIPHER_CONTENT_TYPE,
  PhotoTransferConflictError,
  PhotoTransferNotFoundError,
  PhotoTransferValidationError,
  type BeginPhotoUploadInput,
  type BeginPhotoUploadResult,
  type DirectPhotoTransfer,
  type PhotoDownloadGrant,
  type PhotoUploadGrant,
} from './photoTransfer';
import { CipherConflictError, type CipherStore } from './store';

type Queryable = Pick<Pool, 'query'>;

interface AccountRow {
  id: string;
  login_name: string;
  password_hash: string;
  disabled_at: Date | string | null;
}

interface SessionRow {
  account_id: string;
  token_hash: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}

interface VaultRow {
  payload_json: unknown;
}

interface MemoryRow {
  revision: number;
  payload_json: unknown;
}

interface PhotoRow {
  payload_json: unknown;
}

interface StoredCosPhotoRow {
  account_id: string;
  photo_id: string;
  crypto_version: number;
  payload_json: unknown;
  storage_kind: 'cos' | null;
  object_key: string | null;
  photo_kind: EncryptedPhotoV1['kind'] | null;
  metadata_json: unknown;
  transfer_status: 'pending' | 'ready' | null;
  upload_id: string | null;
  content_length: number | string | null;
  content_sha256: string | null;
  object_etag: string | null;
  upload_expires_at: Date | string | null;
  completed_at: Date | string | null;
}

export interface PostgresCosCipherStoreOptions {
  signedUrlTtlSeconds?: number;
  pendingUploadTtlMs?: number;
  now?: () => Date;
}

function normalizeLoginName(value: string): string {
  return value.trim().toLowerCase();
}

function toIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function fromJsonColumn<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  if (!value || typeof value !== 'object') {
    throw new Error('数据库中的密文 JSON 无效。');
  }
  return structuredClone(value) as T;
}

function toJsonParameter(value: unknown): string {
  return JSON.stringify(value);
}

function toSafeInteger(value: number | string | null, name: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed === null || parsed < 0) {
    throw new Error(`数据库中的${name}无效。`);
  }
  return parsed;
}

function rowUploadExpiresAt(row: StoredCosPhotoRow): Date | null {
  if (row.upload_expires_at === null) return null;
  const value = row.upload_expires_at instanceof Date
    ? row.upload_expires_at
    : new Date(row.upload_expires_at);
  if (Number.isNaN(value.getTime())) {
    throw new Error('数据库中的照片上传过期时间无效。');
  }
  return value;
}

export function createPostgresPool(connectionString: string): Pool {
  if (!connectionString.trim()) {
    throw new Error('MEMORY_RECALL_DATABASE_URL 不能为空。');
  }
  return new Pool({ connectionString });
}

export class PostgresPasswordAuthStore implements PasswordAuthStore {
  constructor(private readonly database: Queryable) {}

  async createInvitedAccount(input: {
    id?: string;
    loginName: string;
    password: string;
    passwordHash?: PasswordHashOptions;
  }): Promise<PasswordAccount> {
    const loginName = normalizeLoginName(input.loginName);
    if (loginName.length < 3) {
      throw new Error('账号至少需要 3 个字符。');
    }
    const account: PasswordAccount = {
      id: input.id ?? randomUUID(),
      loginName,
      passwordHash: await hashPassword(input.password, input.passwordHash),
      disabledAt: null,
    };
    try {
      await this.database.query(
        `INSERT INTO accounts (id, login_name, password_hash)
         VALUES ($1::uuid, $2, $3)`,
        [account.id, account.loginName, account.passwordHash],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new Error('账号已存在。');
      }
      throw error;
    }
    return account;
  }

  async findAccountByLogin(loginName: string): Promise<PasswordAccount | null> {
    const result = await this.database.query<AccountRow>(
      `SELECT id::text, login_name, password_hash, disabled_at
       FROM accounts
       WHERE login_name = $1`,
      [normalizeLoginName(loginName)],
    );
    const account = result.rows[0];
    if (!account) return null;
    return {
      id: account.id,
      loginName: account.login_name,
      passwordHash: account.password_hash,
      disabledAt: toIsoString(account.disabled_at),
    };
  }

  async createSession(session: NewStoredSession): Promise<void> {
    await this.database.query(
      `INSERT INTO sessions (
         id, account_id, token_hash, device_id, expires_at, revoked_at, created_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz
       )`,
      [
        randomUUID(),
        session.accountId,
        session.tokenHash,
        session.deviceId,
        session.expiresAt,
        session.revokedAt,
        session.createdAt,
      ],
    );
  }

  async findSessionByTokenHash(tokenHash: string): Promise<StoredSession | null> {
    const result = await this.database.query<SessionRow>(
      `SELECT sessions.account_id::text, sessions.token_hash, sessions.expires_at, sessions.revoked_at
       FROM sessions
       INNER JOIN accounts ON accounts.id = sessions.account_id
       WHERE sessions.token_hash = $1
         AND accounts.disabled_at IS NULL`,
      [tokenHash],
    );
    const session = result.rows[0];
    if (!session) return null;
    return {
      accountId: session.account_id,
      tokenHash: session.token_hash,
      expiresAt: toIsoString(session.expires_at)!,
      revokedAt: toIsoString(session.revoked_at),
    };
  }

  async revokeSessionByTokenHash(tokenHash: string, revokedAt: string): Promise<void> {
    await this.database.query(
      `UPDATE sessions
       SET revoked_at = $2::timestamptz
       WHERE token_hash = $1
         AND revoked_at IS NULL`,
      [tokenHash, revokedAt],
    );
  }
}

export class PostgresCipherStore implements CipherStore {
  constructor(private readonly database: Queryable) {}

  async getVault(accountId: string): Promise<VaultEnvelopeV1 | null> {
    const result = await this.database.query<VaultRow>(
      'SELECT payload_json FROM vault_envelopes WHERE account_id = $1::uuid',
      [accountId],
    );
    const row = result.rows[0];
    return row ? fromJsonColumn<VaultEnvelopeV1>(row.payload_json) : null;
  }

  async putVault(accountId: string, vault: VaultEnvelopeV1): Promise<void> {
    await this.database.query(
      `INSERT INTO vault_envelopes (account_id, crypto_version, payload_json)
       VALUES ($1::uuid, $2, $3::jsonb)
       ON CONFLICT (account_id) DO UPDATE
       SET crypto_version = EXCLUDED.crypto_version,
           payload_json = EXCLUDED.payload_json,
           updated_at = CURRENT_TIMESTAMP`,
      [accountId, vault.cryptoVersion, toJsonParameter(vault)],
    );
  }

  async listMemories(accountId: string): Promise<EncryptedMemoryV1[]> {
    const result = await this.database.query<MemoryRow>(
      `SELECT revision, payload_json
       FROM memory_ciphers
       WHERE account_id = $1::uuid
       ORDER BY memory_id ASC`,
      [accountId],
    );
    return result.rows.map((row) => fromJsonColumn<EncryptedMemoryV1>(row.payload_json));
  }

  async putMemory(accountId: string, memory: EncryptedMemoryV1): Promise<void> {
    const inserted = await this.database.query<MemoryRow>(
      `INSERT INTO memory_ciphers (
         account_id, memory_id, revision, crypto_version, deleted, payload_json
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (account_id, memory_id) DO UPDATE
       SET revision = EXCLUDED.revision,
           crypto_version = EXCLUDED.crypto_version,
           deleted = EXCLUDED.deleted,
           payload_json = EXCLUDED.payload_json,
           updated_at = CURRENT_TIMESTAMP
       WHERE EXCLUDED.revision > memory_ciphers.revision
          OR (
            EXCLUDED.revision = memory_ciphers.revision
            AND memory_ciphers.payload_json = EXCLUDED.payload_json
          )
       RETURNING revision, payload_json`,
      [
        accountId,
        memory.id,
        memory.version,
        memory.cryptoVersion,
        memory.deleted,
        toJsonParameter(memory),
      ],
    );
    if (inserted.rowCount) return;

    const current = await this.database.query<MemoryRow>(
      `SELECT revision, payload_json
       FROM memory_ciphers
       WHERE account_id = $1::uuid AND memory_id = $2`,
      [accountId, memory.id],
    );
    const existing = current.rows[0];
    if (existing && existing.revision > memory.version) {
      throw new CipherConflictError('服务器已有更新版本的记忆密文。');
    }
    throw new CipherConflictError('同一版本对应了不同的记忆密文。');
  }

  async getPhoto(accountId: string, photoId: string): Promise<EncryptedPhotoV1 | null> {
    const result = await this.database.query<PhotoRow>(
      `SELECT payload_json
       FROM photo_ciphers
       WHERE account_id = $1::uuid AND photo_id = $2 AND photo_kind = 'original'`,
      [accountId, photoId],
    );
    const row = result.rows[0];
    return row ? fromJsonColumn<EncryptedPhotoV1>(row.payload_json) : null;
  }

  async putPhoto(accountId: string, photo: EncryptedPhotoV1): Promise<void> {
    const inserted = await this.database.query(
      `INSERT INTO photo_ciphers (account_id, photo_id, photo_kind, crypto_version, payload_json)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
       ON CONFLICT (account_id, photo_id, photo_kind) DO UPDATE
       SET crypto_version = EXCLUDED.crypto_version,
           payload_json = EXCLUDED.payload_json,
           updated_at = CURRENT_TIMESTAMP
       WHERE photo_ciphers.payload_json = EXCLUDED.payload_json
       RETURNING photo_id`,
      [accountId, photo.id, photo.kind, photo.cryptoVersion, toJsonParameter(photo)],
    );
    if (!inserted.rowCount) {
      throw new CipherConflictError('同一照片 ID 对应了不同的密文。');
    }
  }
}

const STORED_COS_PHOTO_COLUMNS = `
  account_id::text, photo_id, crypto_version, payload_json, storage_kind,
  object_key, photo_kind, metadata_json, transfer_status, upload_id::text,
  content_length, content_sha256, object_etag, upload_expires_at, completed_at
`;

const MAX_DIRECT_PHOTO_BYTES: Record<PhotoKind, number> = {
  ...FROZEN_PHOTO_TRANSFER_LIMITS.maxBytes,
};

async function deleteUploadedObject(objectStore: DirectPhotoObjectStore, key: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await objectStore.deleteObject(key);
      return;
    } catch {
      // The database transaction has already failed or selected another object.
      // Do not expose encrypted payloads or object credentials through an error.
    }
  }
}

export class PostgresCosCipherStore implements CipherStore, DirectPhotoTransfer {
  private readonly postgresStore: PostgresCipherStore;
  private readonly signedUrlTtlSeconds: number;
  private readonly pendingUploadTtlMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly database: Queryable,
    private readonly objectStore: DirectPhotoObjectStore,
    options: PostgresCosCipherStoreOptions = {},
  ) {
    this.postgresStore = new PostgresCipherStore(database);
    this.signedUrlTtlSeconds = options.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
    this.pendingUploadTtlMs = options.pendingUploadTtlMs ?? DEFAULT_PENDING_UPLOAD_TTL_MS;
    this.now = options.now ?? (() => new Date());
    if (
      !Number.isInteger(this.signedUrlTtlSeconds)
      || this.signedUrlTtlSeconds < 1
      || this.signedUrlTtlSeconds > 3600
    ) {
      throw new Error('照片签名有效期必须在 1 到 3600 秒之间。');
    }
    if (!Number.isInteger(this.pendingUploadTtlMs) || this.pendingUploadTtlMs < 60_000) {
      throw new Error('照片待上传有效期不能小于 1 分钟。');
    }
  }

  getVault(accountId: string): Promise<VaultEnvelopeV1 | null> {
    return this.postgresStore.getVault(accountId);
  }

  putVault(accountId: string, vault: VaultEnvelopeV1): Promise<void> {
    return this.postgresStore.putVault(accountId, vault);
  }

  listMemories(accountId: string): Promise<EncryptedMemoryV1[]> {
    return this.postgresStore.listMemories(accountId);
  }

  putMemory(accountId: string, memory: EncryptedMemoryV1): Promise<void> {
    return this.postgresStore.putMemory(accountId, memory);
  }

  private async existingPhoto(
    accountId: string,
    photoId: string,
    kind: PhotoKind,
  ): Promise<StoredCosPhotoRow | null> {
    const result = await this.database.query<StoredCosPhotoRow>(
      `SELECT ${STORED_COS_PHOTO_COLUMNS}
       FROM photo_ciphers
       WHERE account_id = $1::uuid AND photo_id = $2 AND photo_kind = $3`,
      [accountId, photoId, kind],
    );
    return result.rows[0] ?? null;
  }

  private async fromStoredPhoto(row: StoredCosPhotoRow): Promise<EncryptedPhotoV1> {
    if (row.storage_kind !== 'cos') {
      return fromJsonColumn<EncryptedPhotoV1>(row.payload_json);
    }
    if (row.transfer_status !== 'ready') {
      throw new Error('照片密文尚未完成上传。');
    }
    if (!row.object_key || !row.photo_kind || !row.metadata_json) {
      throw new Error('数据库中的 COS 照片引用无效。');
    }
    const content = JSON.parse(await this.objectStore.getObject(row.object_key)) as EncryptedPhotoV1['content'];
    return {
      id: row.photo_id,
      cryptoVersion: row.crypto_version as 1,
      kind: row.photo_kind,
      metadata: fromJsonColumn<EncryptedPhotoV1['metadata']>(row.metadata_json),
      content,
    };
  }

  async getPhoto(accountId: string, photoId: string): Promise<EncryptedPhotoV1 | null> {
    const row = await this.existingPhoto(accountId, photoId, 'original');
    return row && row.transfer_status !== 'pending' ? this.fromStoredPhoto(row) : null;
  }

  async putPhoto(accountId: string, photo: EncryptedPhotoV1): Promise<void> {
    const existing = await this.existingPhoto(accountId, photo.id, photo.kind);
    if (existing) {
      if (existing.transfer_status === 'pending') {
        throw new CipherConflictError('同一照片档位正在直传。');
      }
      const existingPhoto = await this.fromStoredPhoto(existing);
      if (!isDeepStrictEqual(existingPhoto, photo)) {
        throw new CipherConflictError('同一照片 ID 对应了不同的密文。');
      }
      return;
    }

    const objectKey = `memory-recall/v1/${accountId}/photos/${encodeURIComponent(photo.id)}/${photo.kind}/${randomUUID()}.json`;
    const serializedContent = toJsonParameter(photo.content);
    await this.objectStore.putObject(objectKey, serializedContent);
    const inserted = await this.database.query<StoredCosPhotoRow>(
      `INSERT INTO photo_ciphers (
         account_id, photo_id, photo_kind, crypto_version, payload_json,
         storage_kind, object_key, metadata_json, transfer_status,
         content_length, completed_at
       ) VALUES (
         $1::uuid, $2, $3, $4, NULL,
         'cos', $5, $6::jsonb, 'ready',
         $7, CURRENT_TIMESTAMP
       )
       ON CONFLICT (account_id, photo_id, photo_kind) DO NOTHING
       RETURNING ${STORED_COS_PHOTO_COLUMNS}`,
      [
        accountId,
        photo.id,
        photo.kind,
        photo.cryptoVersion,
        objectKey,
        toJsonParameter(photo.metadata),
        Buffer.byteLength(serializedContent, 'utf8'),
      ],
    );
    if (inserted.rowCount) return;

    try {
      const concurrent = await this.existingPhoto(accountId, photo.id, photo.kind);
      if (!concurrent) {
        throw new Error('照片密文写入后无法读取。');
      }
      const concurrentPhoto = await this.fromStoredPhoto(concurrent);
      if (!isDeepStrictEqual(concurrentPhoto, photo)) {
        throw new CipherConflictError('同一照片 ID 对应了不同的密文。');
      }
    } finally {
      await deleteUploadedObject(this.objectStore, objectKey);
    }
  }

  private async uploadGrant(row: StoredCosPhotoRow): Promise<PhotoUploadGrant> {
    const expires = rowUploadExpiresAt(row);
    if (!row.object_key || !row.upload_id || !expires) {
      throw new Error('数据库中的待上传照片引用无效。');
    }
    const signedAt = this.now();
    const remainingMs = expires.getTime() - signedAt.getTime();
    if (remainingMs < 1000) {
      throw new PhotoTransferConflictError('上一次照片上传已经过期，请稍后重试。');
    }
    const expiresInSeconds = Math.min(
      this.signedUrlTtlSeconds,
      Math.floor(remainingMs / 1000),
    );
    return {
      status: 'upload',
      uploadId: row.upload_id,
      method: 'PUT',
      url: await this.objectStore.createSignedUrl(
        row.object_key,
        'PUT',
        expiresInSeconds,
      ),
      headers: { 'content-type': PHOTO_CIPHER_CONTENT_TYPE },
      expiresAt: new Date(signedAt.getTime() + expiresInSeconds * 1000).toISOString(),
    };
  }

  private async resumePendingUpload(
    row: StoredCosPhotoRow,
    input: BeginPhotoUploadInput,
  ): Promise<BeginPhotoUploadResult> {
    const sameMetadata = row.metadata_json
      && isDeepStrictEqual(
        fromJsonColumn<SealedBytesV1>(row.metadata_json),
        input.metadata,
      );
    const sameLength = row.content_length !== null
      && toSafeInteger(row.content_length, '照片密文长度') === input.contentLength;
    const sameDigest = row.content_sha256 === input.contentSha256;
    if (
      row.crypto_version !== input.cryptoVersion
      || !sameMetadata
      || !sameLength
      || !sameDigest
    ) {
      throw new PhotoTransferConflictError('同一照片档位对应了不同的待上传密文。');
    }
    if (row.transfer_status === 'ready') return { status: 'complete' };
    if (row.transfer_status !== 'pending') {
      throw new PhotoTransferConflictError('同一照片档位对应了无效的上传状态。');
    }
    return this.uploadGrant(row);
  }

  async beginUpload(
    accountId: string,
    input: BeginPhotoUploadInput,
  ): Promise<BeginPhotoUploadResult> {
    if (input.contentLength > MAX_DIRECT_PHOTO_BYTES[input.kind]) {
      throw new PhotoTransferValidationError(`${input.kind} 照片密文超过允许大小。`);
    }
    await this.cleanupExpiredUploads();
    const existing = await this.existingPhoto(accountId, input.id, input.kind);
    if (existing) return this.resumePendingUpload(existing, input);

    const uploadId = randomUUID();
    const objectKey = `memory-recall/v1/${accountId}/photos/${encodeURIComponent(input.id)}/${input.kind}/${randomUUID()}.json`;
    const uploadExpiresAt = new Date(this.now().getTime() + this.pendingUploadTtlMs);
    const inserted = await this.database.query<StoredCosPhotoRow>(
      `INSERT INTO photo_ciphers (
         account_id, photo_id, photo_kind, crypto_version, payload_json,
         storage_kind, object_key, metadata_json, transfer_status,
         upload_id, content_length, content_sha256, upload_expires_at
       ) VALUES (
         $1::uuid, $2, $3, $4, NULL,
         'cos', $5, $6::jsonb, 'pending',
         $7::uuid, $8, $9, $10::timestamptz
       )
       ON CONFLICT (account_id, photo_id, photo_kind) DO NOTHING
       RETURNING ${STORED_COS_PHOTO_COLUMNS}`,
      [
        accountId,
        input.id,
        input.kind,
        input.cryptoVersion,
        objectKey,
        toJsonParameter(input.metadata),
        uploadId,
        input.contentLength,
        input.contentSha256,
        uploadExpiresAt.toISOString(),
      ],
    );
    const row = inserted.rows[0]
      ?? await this.existingPhoto(accountId, input.id, input.kind);
    if (!row) {
      throw new Error('创建照片直传记录后无法读取。');
    }
    return row.upload_id === uploadId
      ? this.uploadGrant(row)
      : this.resumePendingUpload(row, input);
  }

  async completeUpload(
    accountId: string,
    photoId: string,
    kind: PhotoKind,
    uploadId: string,
  ): Promise<void> {
    const row = await this.existingPhoto(accountId, photoId, kind);
    if (!row || row.upload_id !== uploadId) {
      throw new PhotoTransferNotFoundError('找不到待完成的照片上传。');
    }
    if (row.transfer_status === 'ready') return;
    const expires = rowUploadExpiresAt(row);
    if (!expires || expires.getTime() <= this.now().getTime()) {
      await this.cleanupExpiredUploads();
      throw new PhotoTransferNotFoundError('照片上传已经过期。');
    }
    if (!row.object_key || row.content_length === null) {
      throw new Error('数据库中的待上传照片引用无效。');
    }
    let head;
    try {
      head = await this.objectStore.headObject(row.object_key);
    } catch (error) {
      if (error instanceof PhotoObjectNotFoundError) {
        throw new PhotoTransferValidationError('照片密文尚未上传到 COS。');
      }
      throw error;
    }
    const expectedLength = toSafeInteger(row.content_length, '照片密文长度');
    if (head.contentLength !== expectedLength) {
      throw new PhotoTransferValidationError('COS 照片密文长度与申请不一致。');
    }
    const completedAt = this.now().toISOString();
    const updated = await this.database.query(
      `UPDATE photo_ciphers
       SET transfer_status = 'ready',
           object_etag = $5,
           upload_expires_at = NULL,
           completed_at = $6::timestamptz,
           updated_at = CURRENT_TIMESTAMP
       WHERE account_id = $1::uuid
         AND photo_id = $2
         AND photo_kind = $3
         AND upload_id = $4::uuid
         AND transfer_status = 'pending'`,
      [accountId, photoId, kind, uploadId, head.etag, completedAt],
    );
    if (updated.rowCount) return;
    const concurrent = await this.existingPhoto(accountId, photoId, kind);
    if (concurrent?.upload_id === uploadId && concurrent.transfer_status === 'ready') return;
    throw new PhotoTransferConflictError('照片上传状态已经发生变化。');
  }

  async createDownload(
    accountId: string,
    photoId: string,
    kind: PhotoKind,
  ): Promise<PhotoDownloadGrant | null> {
    const row = await this.existingPhoto(accountId, photoId, kind);
    if (
      !row
      || row.storage_kind !== 'cos'
      || row.transfer_status !== 'ready'
      || !row.object_key
      || !row.metadata_json
    ) {
      return null;
    }
    let contentLength: number;
    if (row.content_length === null) {
      const head = await this.objectStore.headObject(row.object_key);
      contentLength = head.contentLength;
      await this.database.query(
        `UPDATE photo_ciphers
         SET content_length = $4, object_etag = COALESCE(object_etag, $5)
         WHERE account_id = $1::uuid
           AND photo_id = $2
           AND photo_kind = $3
           AND transfer_status = 'ready'
           AND content_length IS NULL`,
        [accountId, photoId, kind, contentLength, head.etag],
      );
    } else {
      contentLength = toSafeInteger(row.content_length, '照片密文长度');
    }
    const signedAt = this.now();
    return {
      id: photoId,
      kind,
      cryptoVersion: row.crypto_version as 1,
      metadata: fromJsonColumn<SealedBytesV1>(row.metadata_json),
      contentLength,
      contentSha256: row.content_sha256,
      method: 'GET',
      url: await this.objectStore.createSignedUrl(
        row.object_key,
        'GET',
        this.signedUrlTtlSeconds,
      ),
      headers: {},
      expiresAt: new Date(
        signedAt.getTime() + this.signedUrlTtlSeconds * 1000,
      ).toISOString(),
    };
  }

  async cleanupExpiredUploads(): Promise<number> {
    const expired = await this.database.query<StoredCosPhotoRow>(
      `WITH expired_keys AS (
         SELECT account_id, photo_id, photo_kind
         FROM photo_ciphers
         WHERE storage_kind = 'cos'
           AND transfer_status = 'pending'
           AND upload_expires_at <= $1::timestamptz
         ORDER BY upload_expires_at ASC
         LIMIT 100
         FOR UPDATE SKIP LOCKED
       )
       DELETE FROM photo_ciphers
       WHERE (account_id, photo_id, photo_kind) IN (
         SELECT account_id, photo_id, photo_kind
         FROM expired_keys
       )
         AND transfer_status = 'pending'
         AND upload_expires_at <= $1::timestamptz
       RETURNING ${STORED_COS_PHOTO_COLUMNS}`,
      [this.now().toISOString()],
    );
    for (const row of expired.rows) {
      if (!row.object_key) continue;
      try {
        await this.objectStore.deleteObject(row.object_key);
      } catch {
        // The database row is already gone, so this encrypted orphan can no
        // longer receive a signed URL. Operations should reconcile it later.
      }
    }
    return expired.rowCount ?? 0;
  }
}
