export interface StoredAccountSession {
  accessToken: string;
  expiresAt: string;
}

const SESSION_EXPIRY_SKEW_MS = 30_000;

export function isStoredAccountSession(value: unknown): value is StoredAccountSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<StoredAccountSession>;
  return typeof session.accessToken === 'string'
    && session.accessToken.length > 0
    && typeof session.expiresAt === 'string'
    && Number.isFinite(Date.parse(session.expiresAt));
}

export function isAccountSessionActive(
  session: StoredAccountSession,
  now = Date.now(),
): boolean {
  return Date.parse(session.expiresAt) - SESSION_EXPIRY_SKEW_MS > now;
}
