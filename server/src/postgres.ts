import { randomUUID } from 'node:crypto';
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
  VaultEnvelopeV1,
} from './contracts';
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
       WHERE account_id = $1::uuid AND photo_id = $2`,
      [accountId, photoId],
    );
    const row = result.rows[0];
    return row ? fromJsonColumn<EncryptedPhotoV1>(row.payload_json) : null;
  }

  async putPhoto(accountId: string, photo: EncryptedPhotoV1): Promise<void> {
    const inserted = await this.database.query(
      `INSERT INTO photo_ciphers (account_id, photo_id, crypto_version, payload_json)
       VALUES ($1::uuid, $2, $3, $4::jsonb)
       ON CONFLICT (account_id, photo_id) DO UPDATE
       SET crypto_version = EXCLUDED.crypto_version,
           payload_json = EXCLUDED.payload_json,
           updated_at = CURRENT_TIMESTAMP
       WHERE photo_ciphers.payload_json = EXCLUDED.payload_json
       RETURNING photo_id`,
      [accountId, photo.id, photo.cryptoVersion, toJsonParameter(photo)],
    );
    if (!inserted.rowCount) {
      throw new CipherConflictError('同一照片 ID 对应了不同的密文。');
    }
  }
}
