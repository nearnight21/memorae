export interface CipherSyncQueueState {
  version: number;
  uploadedVersion: number;
  lastSuccessAt?: string;
}

export const INITIAL_CIPHER_SYNC_QUEUE: CipherSyncQueueState = {
  version: 1,
  uploadedVersion: 0,
};

export function readCipherSyncQueueState(value: unknown): CipherSyncQueueState {
  if (!value || typeof value !== 'object') return { ...INITIAL_CIPHER_SYNC_QUEUE };
  const state = value as Partial<CipherSyncQueueState>;
  if (
    !Number.isSafeInteger(state.version)
    || !Number.isSafeInteger(state.uploadedVersion)
    || state.version! < 0
    || state.uploadedVersion! < 0
  ) {
    return { ...INITIAL_CIPHER_SYNC_QUEUE };
  }
  return {
    version: state.version!,
    uploadedVersion: Math.min(state.version!, state.uploadedVersion!),
    ...(typeof state.lastSuccessAt === 'string' ? { lastSuccessAt: state.lastSuccessAt } : {}),
  };
}

export function markCipherSyncQueuePending(
  current: CipherSyncQueueState,
): CipherSyncQueueState {
  return { ...current, version: current.version + 1 };
}

export function completeCipherSyncQueueVersion(
  current: CipherSyncQueueState,
  uploadedVersion: number,
  completedAt: string,
): CipherSyncQueueState {
  return {
    ...current,
    uploadedVersion: Math.max(
      current.uploadedVersion,
      Math.min(current.version, uploadedVersion),
    ),
    lastSuccessAt: completedAt,
  };
}
