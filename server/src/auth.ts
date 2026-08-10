import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { argon2Verify, argon2id } from 'hash-wasm';

export interface AuthenticatedAccount {
  accountId: string;
}

export interface LoginCredentials {
  loginName: string;
  password: string;
  deviceId?: string;
}

export interface LoginSession {
  accessToken: string;
  expiresAt: string;
}

export interface RequestAuthenticator {
  authenticate(accessToken: string): Promise<AuthenticatedAccount | null>;
  login?(credentials: LoginCredentials): Promise<LoginSession | null>;
}

export interface PasswordAccount {
  id: string;
  loginName: string;
  passwordHash: string;
  disabledAt: string | null;
}

export interface StoredSession {
  accountId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface NewStoredSession extends StoredSession {
  deviceId: string | null;
  createdAt: string;
}

export interface PasswordAuthStore {
  findAccountByLogin(loginName: string): Promise<PasswordAccount | null>;
  createSession(session: NewStoredSession): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredSession | null>;
}

export interface PasswordHashOptions {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

export interface PasswordSessionAuthenticatorOptions {
  tokenPepper: string;
  sessionTtlMs?: number;
  passwordHash?: PasswordHashOptions;
  now?: () => Date;
}

const DEFAULT_PASSWORD_HASH: PasswordHashOptions = {
  memoryKiB: 19 * 1024,
  iterations: 2,
  parallelism: 1,
};

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeLoginName(value: string): string {
  return value.trim().toLowerCase();
}

function validateLoginCredentials(credentials: LoginCredentials): void {
  if (normalizeLoginName(credentials.loginName).length < 3) {
    throw new Error('账号至少需要 3 个字符。');
  }
  if (credentials.password.length < 8) {
    throw new Error('密码至少需要 8 个字符。');
  }
}

function tokenHash(tokenPepper: string, accessToken: string): string {
  return createHmac('sha256', tokenPepper)
    .update(accessToken, 'utf8')
    .digest('base64url');
}

function sameToken(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function hashPassword(
  password: string,
  options: PasswordHashOptions = DEFAULT_PASSWORD_HASH,
): Promise<string> {
  if (password.length < 8) {
    throw new Error('密码至少需要 8 个字符。');
  }
  const result = await argon2id({
    password,
    salt: randomBytes(16),
    memorySize: options.memoryKiB,
    iterations: options.iterations,
    parallelism: options.parallelism,
    hashLength: 32,
    outputType: 'encoded',
  });
  return result;
}

export class LocalTokenAuthenticator implements RequestAuthenticator {
  constructor(
    private readonly localToken: string,
    private readonly accountId = 'local-user',
  ) {
    if (localToken.length < 16) {
      throw new Error('本地访问令牌至少需要 16 个字符。');
    }
  }

  async authenticate(accessToken: string): Promise<AuthenticatedAccount | null> {
    return sameToken(this.localToken, accessToken) ? { accountId: this.accountId } : null;
  }
}

export class PasswordSessionAuthenticator implements RequestAuthenticator {
  private readonly passwordHash: PasswordHashOptions;
  private readonly sessionTtlMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly store: PasswordAuthStore,
    private readonly options: PasswordSessionAuthenticatorOptions,
  ) {
    if (options.tokenPepper.length < 32) {
      throw new Error('会话令牌密钥至少需要 32 个字符。');
    }
    this.passwordHash = options.passwordHash ?? DEFAULT_PASSWORD_HASH;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? (() => new Date());
  }

  async login(credentials: LoginCredentials): Promise<LoginSession | null> {
    validateLoginCredentials(credentials);
    const account = await this.store.findAccountByLogin(
      normalizeLoginName(credentials.loginName),
    );
    if (!account || account.disabledAt) return null;
    if (!await argon2Verify({ password: credentials.password, hash: account.passwordHash })) {
      return null;
    }

    const accessToken = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.sessionTtlMs).toISOString();
    await this.store.createSession({
      accountId: account.id,
      tokenHash: tokenHash(this.options.tokenPepper, accessToken),
      deviceId: credentials.deviceId?.trim() || null,
      createdAt: createdAt.toISOString(),
      expiresAt,
      revokedAt: null,
    });
    return { accessToken, expiresAt };
  }

  async authenticate(accessToken: string): Promise<AuthenticatedAccount | null> {
    if (!accessToken) return null;
    const session = await this.store.findSessionByTokenHash(
      tokenHash(this.options.tokenPepper, accessToken),
    );
    if (!session || session.revokedAt || new Date(session.expiresAt) <= this.now()) {
      return null;
    }
    return { accountId: session.accountId };
  }

  getPasswordHashOptions(): PasswordHashOptions {
    return { ...this.passwordHash };
  }
}

export class InMemoryPasswordAuthStore implements PasswordAuthStore {
  private readonly accountsByLogin = new Map<string, PasswordAccount>();
  private readonly sessionsByTokenHash = new Map<string, StoredSession>();

  async addAccount(input: {
    id: string;
    loginName: string;
    password: string;
    disabledAt?: string | null;
    passwordHash?: PasswordHashOptions;
  }): Promise<void> {
    const loginName = normalizeLoginName(input.loginName);
    if (this.accountsByLogin.has(loginName)) {
      throw new Error('账号已存在。');
    }
    this.accountsByLogin.set(loginName, {
      id: input.id,
      loginName,
      passwordHash: await hashPassword(input.password, input.passwordHash),
      disabledAt: input.disabledAt ?? null,
    });
  }

  async findAccountByLogin(loginName: string): Promise<PasswordAccount | null> {
    const account = this.accountsByLogin.get(normalizeLoginName(loginName));
    return account ? { ...account } : null;
  }

  async createSession(session: NewStoredSession): Promise<void> {
    this.sessionsByTokenHash.set(session.tokenHash, { ...session });
  }

  async findSessionByTokenHash(tokenHashValue: string): Promise<StoredSession | null> {
    const session = this.sessionsByTokenHash.get(tokenHashValue);
    return session ? { ...session } : null;
  }
}
