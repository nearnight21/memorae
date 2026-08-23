import * as SecureStore from 'expo-secure-store';

export interface MobileAccountSession {
  accessToken: string;
  expiresAt: string;
}

const ACCOUNT_SESSION_KEY = 'memory-recall.account-session.v1';

export function isAccountSessionActive(value: unknown): value is MobileAccountSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MobileAccountSession>;
  return typeof candidate.accessToken === 'string'
    && candidate.accessToken.length > 0
    && typeof candidate.expiresAt === 'string'
    && Number.isFinite(Date.parse(candidate.expiresAt))
    && Date.parse(candidate.expiresAt) > Date.now();
}

export async function getStoredAccountSession(): Promise<MobileAccountSession | null> {
  const value = await SecureStore.getItemAsync(ACCOUNT_SESSION_KEY);
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isAccountSessionActive(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveStoredAccountSession(session: MobileAccountSession): Promise<void> {
  await SecureStore.setItemAsync(ACCOUNT_SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredAccountSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCOUNT_SESSION_KEY);
}
