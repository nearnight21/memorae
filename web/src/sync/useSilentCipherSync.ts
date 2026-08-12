import { useCallback, useEffect, useRef } from 'react';
import {
  clearStoredAccountSession,
  getCipherSyncQueueState,
  markCipherSyncCompleted,
  markCipherSyncPending,
} from '../prototype/storage';
import { isAccountSessionActive, type StoredAccountSession } from './accountSession';
import { cipherSyncStorage } from './cipherSyncStorage';
import { MEMORY_RECALL_API_URL } from './config';
import { uploadCiphertext, VaultMismatchError } from './syncActions';
import { MemoryRecallSyncClient, SyncRequestError } from './syncClient';

interface SilentCipherSyncOptions {
  accountSession: StoredAccountSession | null;
  onSessionExpired: () => void;
}

export function useSilentCipherSync({
  accountSession,
  onSessionExpired,
}: SilentCipherSyncOptions): () => Promise<void> {
  const sessionRef = useRef(accountSession);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const onSessionExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    sessionRef.current = accountSession;
  }, [accountSession]);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  const flush = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    const currentSession = sessionRef.current;
    if (
      !MEMORY_RECALL_API_URL
      || !currentSession
      || !isAccountSessionActive(currentSession)
      || !navigator.onLine
    ) {
      return;
    }

    const operation = (async () => {
      const client = new MemoryRecallSyncClient({
        baseUrl: MEMORY_RECALL_API_URL,
        token: currentSession.accessToken,
      });
      while (true) {
        const queue = await getCipherSyncQueueState();
        if (queue.uploadedVersion >= queue.version) return;
        const targetVersion = queue.version;
        await uploadCiphertext(client, cipherSyncStorage);
        await markCipherSyncCompleted(targetVersion);
      }
    })()
      .catch(async (error: unknown) => {
        let shouldRetry = !(error instanceof SyncRequestError && [400, 403, 409].includes(error.status));
        if (
          (error instanceof SyncRequestError && error.status === 401)
          || error instanceof VaultMismatchError
        ) {
          shouldRetry = false;
          await clearStoredAccountSession();
          sessionRef.current = null;
          onSessionExpiredRef.current();
        }
        if (shouldRetry && retryTimerRef.current === null) {
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            void flush();
          }, 15_000);
        }
        // 网络或服务暂不可用时保留待同步版本；短暂退避、联网恢复和下次启动都会自动重试。
      })
      .finally(() => {
        inFlightRef.current = null;
      });
    inFlightRef.current = operation;
    return operation;
  }, []);

  const enqueue = useCallback(async (): Promise<void> => {
    await markCipherSyncPending();
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (inFlightRef.current) {
      void inFlightRef.current.then(flush);
    } else {
      void flush();
    }
  }, [flush]);

  useEffect(() => {
    void flush();
    const handleOnline = () => void flush();
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    };
  }, [flush]);

  return enqueue;
}
