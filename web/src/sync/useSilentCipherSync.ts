import { useCallback, useEffect, useRef } from 'react';
import {
  clearStoredAccountSession,
  getCipherSyncPlan,
  getCipherSyncQueueState,
  markCipherSyncCompleted,
  markCipherSyncPending,
  saveCipherSyncPlan,
} from '../prototype/storage';
import { isAccountSessionActive, type StoredAccountSession } from './accountSession';
import { cipherSyncStorage } from './cipherSyncStorage';
import { MEMORY_RECALL_API_URL } from './config';
import {
  mergeUploadPlans,
  uploadCiphertext,
  type UploadPlan,
  VaultMismatchError,
} from './syncActions';
import { MemoryRecallSyncClient, SyncRequestError } from './syncClient';

function subtractUploadPlan(base: UploadPlan, completed: UploadPlan): UploadPlan {
  const completedMemoryIds = new Set(completed.memoryIds);
  const completedPhotoRefs = new Set(completed.photoRefs.map((photo) => `${photo.id}:${photo.kind}`));
  return {
    memoryIds: base.memoryIds.filter((id) => !completedMemoryIds.has(id)),
    photoRefs: base.photoRefs.filter((photo) => !completedPhotoRefs.has(`${photo.id}:${photo.kind}`)),
  };
}

function hasUploadPlan(plan: UploadPlan): boolean {
  return plan.memoryIds.length > 0 || plan.photoRefs.length > 0;
}

interface SilentCipherSyncOptions {
  accountSession: StoredAccountSession | null;
  onSessionExpired: () => void;
}

export function useSilentCipherSync({
  accountSession,
  onSessionExpired,
}: SilentCipherSyncOptions): (plan?: UploadPlan) => Promise<void> {
  const sessionRef = useRef(accountSession);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const pendingPlanRef = useRef<UploadPlan | null>(null);
  const planWriteQueueRef = useRef(Promise.resolve());
  const onSessionExpiredRef = useRef(onSessionExpired);

  const persistPlan = useCallback((plan: UploadPlan | null): Promise<void> => {
    planWriteQueueRef.current = planWriteQueueRef.current
      .catch(() => undefined)
      .then(() => saveCipherSyncPlan(plan));
    return planWriteQueueRef.current;
  }, []);

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
        const persistedPlan = await getCipherSyncPlan();
        const plan = pendingPlanRef.current ?? persistedPlan;
        // A queue marker without a plan is legacy state (or a vault-only marker).
        // Never turn it into an implicit full-library upload.
        if (!plan) {
          await markCipherSyncCompleted(targetVersion);
          continue;
        }
        pendingPlanRef.current = null;
        try {
          await uploadCiphertext(client, cipherSyncStorage, plan);
        } catch (error) {
          const latest = await getCipherSyncPlan();
          const pending = pendingPlanRef.current;
          const merged = mergeUploadPlans(plan, latest ?? { memoryIds: [], photoRefs: [] });
          pendingPlanRef.current = pending ? mergeUploadPlans(merged, pending) : merged;
          await persistPlan(pendingPlanRef.current);
          throw error;
        }
        const latest = await getCipherSyncPlan();
        const pending = pendingPlanRef.current;
        const remaining = latest ? subtractUploadPlan(latest, plan) : { memoryIds: [], photoRefs: [] };
        const nextPlan = pending ? mergeUploadPlans(remaining, pending) : remaining;
        pendingPlanRef.current = hasUploadPlan(nextPlan) ? nextPlan : null;
        await persistPlan(pendingPlanRef.current);
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
  }, [persistPlan]);

  const enqueue = useCallback(async (plan?: UploadPlan): Promise<void> => {
    if (plan) {
      pendingPlanRef.current = pendingPlanRef.current
        ? mergeUploadPlans(pendingPlanRef.current, plan)
        : plan;
      const persisted = await getCipherSyncPlan();
      pendingPlanRef.current = persisted
        ? mergeUploadPlans(persisted, pendingPlanRef.current)
        : pendingPlanRef.current;
      await persistPlan(pendingPlanRef.current);
    }
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
  }, [flush, persistPlan]);

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
