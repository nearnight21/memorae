import { StatusBar } from 'expo-status-bar';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Button,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  bytesToBase64,
  createVault,
  decryptMemoryV2,
  decryptPhoto,
  destroyVaultSession,
  encryptMemoryV2,
  encryptPhoto,
  unlockVault,
  type MemoryV2,
  type PhotoKind,
  type VaultEnvelopeV1,
  type VaultSessionV1,
} from './src/crypto';
import { nativeCryptoPrimitives } from './src/crypto/nativePrimitives';
import { pickEncryptedBundle, shareEncryptedBundle } from './src/services/bundleFiles';
import { runNativeCompatibilityCheck } from './src/services/compatibility';
import {
  createJpegPhotoVariant,
  PHOTO_VARIANT_SPECS,
} from './src/photos/photoVariants';
import {
  disableDeviceUnlock,
  enableDeviceUnlock,
  hasDeviceUnlock,
  unlockWithDevice,
} from './src/services/deviceUnlock';
import { replaceWithEncryptedBundle } from './src/storage/bundle';
import {
  downloadCiphertext,
  mergeUploadPlans,
  uploadCiphertext,
  type CipherSyncDiagnostics,
  type UploadPlan,
} from './src/sync/syncActions';
import {
  sanitizePhotoPerformanceMetric,
  type PhotoPerformanceMetric,
} from './src/services/performanceDiagnostics';
import { loginSyncSession, MemoryRecallSyncClient, PhotoVariantNotFoundError, SyncRequestError } from './src/sync/syncClient';
import AuthEntryScreen, { type AuthEntryPhase } from './src/auth/AuthEntryScreen';
import {
  clearStoredAccountSession,
  getStoredAccountSession,
  isAccountSessionActive,
  saveStoredAccountSession,
  type MobileAccountSession,
} from './src/auth/accountSession';
import type {
  CameraState,
  MapCameraIdleEvent,
  MapMarkerPressEvent,
  MemoryMapThumbnail,
} from './src/map/MemoraeMap';
import {
  findMemoryForMarker,
  memoriesToMapMarkers,
  type MemoryThumbnailSources,
} from './src/map/memoryMapAdapter';
import { registerMapThumbnail, resetMapThumbnailCache } from './src/map/mapThumbnailCache';
import {
  buildHomeRegionOptions,
  currentHomeRegionLabel,
  HOME_CHINA_CAMERA,
  type HomeRegionOption,
} from './src/map/homeMapModel';
import { loadDecryptedMemories } from './src/memory/memoryStore';
import { filterMemoriesByTimelineYear } from './src/home/timeline/timelineModel';
import HomeScreen from './src/home/HomeScreen';
import MemoryDetailOverlay, { type DetailPhotoState } from './src/detail/MemoryDetailOverlay';
import MemoryEditOverlay from './src/edit/MemoryEditOverlay';
import MemoryPhotoManageOverlay, { type PhotoManageItem } from './src/edit/MemoryPhotoManageOverlay';
import MemoryActionsSheet from './src/edit/MemoryActionsSheet';
import MemoryDeleteConfirmSheet from './src/edit/MemoryDeleteConfirmSheet';
import {
  buildCreatedMemory,
  buildEditedMemory,
  createDeleteTombstone,
  mergePhotoManageSelection,
  removedPhotoIds,
} from './src/edit/editLifecycle';
import LocationPicker from './src/location/LocationPicker';
import { MobileLocationClient, normalizeLocationResult } from './src/location/locationClient';
import type { MemoryLocationV2 } from './src/memory/memoryV2';
import type { MemoryPhotoV1 } from './src/memory/memoryV1';
import type { EphemeralTestBootstrap } from './src/testing/ephemeralTestRuntime';
import { firstPhotoCoordinates, type PhotoCoordinates } from './src/photos/photoMetadata';
import {
  clearEncryptedContent,
  deleteEncryptedPhotoVariants,
  getEncryptedPhoto,
  getEncryptedMemory,
  getPendingUploadPlan,
  getVaultEnvelope,
  initializeStorage,
  listEncryptedMemories,
  listEncryptedPhotoRefs,
  listEncryptedPhotos,
  saveEncryptedMemory,
  saveEncryptedPhoto,
  savePendingUploadPlan,
  saveVaultEnvelope,
} from './src/storage/database';

interface PendingPhoto {
  uri: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
}

interface PendingPhotoSelection {
  photos: PendingPhoto[];
  coordinates: PhotoCoordinates | null;
}

interface EditDraftState {
  kind: 'create' | 'edit';
  original: MemoryV2 | null;
  baseVersion: number | null;
  title: string;
  date: string;
  pastSelf: string;
  presentSelf: string;
  location: MemoryLocationV2 | null;
  photos: MemoryPhotoV1[];
  pendingPhotos: PendingPhoto[];
}

type Mode = 'loading' | 'account' | 'setup' | 'locked' | 'unlocked';
type SyncAuthMode = 'account' | 'token';

const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const AUTH_API_URL = process.env.EXPO_PUBLIC_MEMORY_RECALL_API_URL?.trim() || 'https://memorae.cn';

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fallbackPhotoLocation(coordinates: PhotoCoordinates): MemoryLocationV2 {
  return {
    name: '照片拍摄位置',
    mx: 50,
    my: 50,
    lat: coordinates.lat,
    lng: coordinates.lng,
    provider: 'photo-exif',
  };
}

const cipherSyncStorage = {
  getVault: getVaultEnvelope,
  saveVault: saveVaultEnvelope,
  listMemories: listEncryptedMemories,
  getMemory: getEncryptedMemory,
  listPhotos: listEncryptedPhotos,
  listPhotoRefs: listEncryptedPhotoRefs,
  getPhoto: getEncryptedPhoto,
  saveMemory: saveEncryptedMemory,
  savePhoto: saveEncryptedPhoto,
  deletePhotoVariants: deleteEncryptedPhotoVariants,
};

function memoryDiagnosticErrorType(error: unknown): string {
  return error instanceof Error && error.constructor.name ? error.constructor.name : 'UnknownError';
}

function logMemoryDiagnostics(
  stage: string,
  values: object,
): void {
  console.warn('[memory-diagnostics]', JSON.stringify({ stage, ...values }));
}

function logPhotoPerformance(metric: PhotoPerformanceMetric): void {
  logMemoryDiagnostics('photo-performance', sanitizePhotoPerformanceMetric(metric));
}

interface AppProps {
  testBootstrap?: () => Promise<EphemeralTestBootstrap>;
}

export default function App({ testBootstrap }: AppProps = {}) {
  const [mode, setMode] = useState<Mode>('loading');
  const [vault, setVault] = useState<VaultEnvelopeV1 | null>(null);
  const [session, setSession] = useState<VaultSessionV1 | null>(null);
  const [memories, setMemories] = useState<MemoryV2[]>([]);
  const [thumbnailSources, setThumbnailSources] = useState<MemoryThumbnailSources>({});
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<MemoryV2 | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraftState | null>(null);
  const [draftVisible, setDraftVisible] = useState(false);
  const [photoManageVisible, setPhotoManageVisible] = useState(false);
  const [moreActionsVisible, setMoreActionsVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [detailPhotoUris, setDetailPhotoUris] = useState<(string | null)[]>([]);
  const [detailPhotoStates, setDetailPhotoStates] = useState<DetailPhotoState[]>([]);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [deviceUnlockEnabled, setDeviceUnlockEnabled] = useState(false);
  const [syncUrl, setSyncUrl] = useState('http://127.0.0.1:8788');
  const [syncAuthMode, setSyncAuthMode] = useState<SyncAuthMode>('account');
  const [syncLoginName, setSyncLoginName] = useState('');
  const [syncLoginPassword, setSyncLoginPassword] = useState('');
  const [syncToken, setSyncToken] = useState('');
  const [syncSessionExpiresAt, setSyncSessionExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('正在检查本地密文库……');
  const [accountSession, setAccountSession] = useState<MobileAccountSession | null>(null);
  const [accountLoginName, setAccountLoginName] = useState('');
  const [accountLoginPassword, setAccountLoginPassword] = useState('');
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showPrivatePassword, setShowPrivatePassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [homeViewport, setHomeViewport] = useState<MapCameraIdleEvent>({
    camera: { ...HOME_CHINA_CAMERA },
  });
  const [homeCameraTarget, setHomeCameraTarget] = useState<CameraState | null>(null);
  const [locationCameraTarget, setLocationCameraTarget] = useState<CameraState | null>(null);
  const locationPickerOriginCamera = useRef<CameraState | null>(null);
  const detailLoadId = useRef(0);
  const detailPhotoPerformance = useRef(new Map<number, {
    startedAt: number;
    durationsMs: Record<string, number>;
    bytes?: number;
    displayStartedAt?: number;
  }>());
  const editPendingPhotoPool = useRef(new Map<string, PendingPhoto>());
  const thumbnailLoadId = useRef(0);
  const memoriesRef = useRef<MemoryV2[]>([]);
  const accountUploadQueue = useRef<Promise<void> | null>(null);
  const pendingAccountUploadPlan = useRef<UploadPlan>({ memoryIds: [], photoRefs: [] });
  const activeAccountUploadPlan = useRef<UploadPlan | null>(null);
  const uploadPlanWriteQueue = useRef(Promise.resolve());
  const pendingAccountUploadMessages = useRef<Array<{
    onSuccess: (result: Awaited<ReturnType<typeof uploadCiphertext>>) => string;
    onFailure: (error: unknown) => string;
  }>>([]);
  const testSyncClient = useRef<MemoryRecallSyncClient | null>(null);
  let latestLocalDiagnostics = '';

  function photoRefsForIds(ids: readonly string[]): Array<{ id: string; kind: PhotoKind }> {
    return ids.flatMap((id) => (['thumbnail', 'preview', 'original'] as const).map((kind) => ({ id, kind })));
  }

  function persistPendingAccountUploadPlan(plan: UploadPlan | null): Promise<void> {
    uploadPlanWriteQueue.current = uploadPlanWriteQueue.current
      .catch(() => undefined)
      .then(() => savePendingUploadPlan(plan));
    return uploadPlanWriteQueue.current;
  }

  const stateLabel = useMemo(() => ({
    loading: '启动中',
    account: '账号登录',
    setup: '未创建',
    locked: '已锁定',
    unlocked: '已解锁',
  })[mode], [mode]);

  const visibleMemories = useMemo(
    () => filterMemoriesByTimelineYear(memories, selectedYear),
    [memories, selectedYear],
  );
  const mapMarkers = useMemo(
    () => memoriesToMapMarkers(visibleMemories, thumbnailSources),
    [thumbnailSources, visibleMemories],
  );
  const homeRegionOptions = useMemo(
    () => buildHomeRegionOptions(visibleMemories),
    [visibleMemories],
  );
  const homeRegionLabel = useMemo(
    () => currentHomeRegionLabel(homeViewport, visibleMemories),
    [homeViewport, visibleMemories],
  );
  const mobileLocationClient = useMemo(
    () => accountSession
      ? new MobileLocationClient(new MemoryRecallSyncClient({ baseUrl: AUTH_API_URL, token: accountSession.accessToken }))
      : undefined,
    [accountSession],
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (deleteConfirmVisible) {
        setDeleteConfirmVisible(false);
        return true;
      }
      if (moreActionsVisible) {
        setMoreActionsVisible(false);
        return true;
      }
      if (photoManageVisible) {
        setPhotoManageVisible(false);
        return true;
      }
      if (locationPickerVisible) {
        cancelLocationPicker();
        return true;
      }
      if (editDraft && draftVisible) {
        cancelEdit();
        return true;
      }
      if (selectedMemory) {
        closeMemory();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [deleteConfirmVisible, moreActionsVisible, photoManageVisible, locationPickerVisible, editDraft, draftVisible, selectedMemory, cancelLocationPicker]);

  useEffect(() => {
    void (async () => {
      try {
        resetMapThumbnailCache();
        await initializeStorage();
        if (testBootstrap) {
          const bootstrap = await testBootstrap();
          await clearEncryptedContent();
          await saveVaultEnvelope(bootstrap.envelope);
          testSyncClient.current = bootstrap.client;
          setVault(bootstrap.envelope);
          await finishUnlock(
            bootstrap.session,
            `临时测试模式：已真实加密并上传 ${bootstrap.uploadedMemories} 条示例记忆、${bootstrap.uploadedPhotos} 份照片密文；`,
          );
          return;
        }
        const [storedVault, storedAccount, storedUploadPlan] = await Promise.all([
          getVaultEnvelope(),
          getStoredAccountSession(),
          getPendingUploadPlan(),
        ]);
        if (storedUploadPlan) pendingAccountUploadPlan.current = storedUploadPlan;
        setVault(storedVault);
        setDeviceUnlockEnabled(await hasDeviceUnlock());
        if (!storedAccount || !isAccountSessionActive(storedAccount)) {
          if (storedAccount) await clearStoredAccountSession();
          setMode('account');
          setStatus('等待账号登录。');
          return;
        }
        setAccountSession(storedAccount);
        let remoteVault: VaultEnvelopeV1 | null = null;
        try {
          remoteVault = await readRemoteVault(storedAccount);
        } catch (remoteError) {
          if (remoteError instanceof SyncRequestError && remoteError.status === 401) {
            await clearStoredAccountSession();
            setAccountSession(null);
            setMode('account');
            setStatus('账号会话已过期，请重新登录。');
            return;
          }
          // 网络暂时不可用时保留本机 Envelope，允许离线解锁。
        }
        if (remoteVault) {
          setVault(remoteVault);
          await saveVaultEnvelope(remoteVault);
          setMode('locked');
          setStatus('账号已登录，等待解锁私密空间。');
        } else if (storedVault) {
          setMode('locked');
          setStatus('账号已登录，等待解锁私密空间。');
        } else {
          setMode('setup');
          setStatus('账号已登录，请建立私密空间。');
        }
      } catch (error) {
        setStatus(`启动失败：${errorMessage(error)}`);
        setMode('account');
      }
    })();
  }, [testBootstrap]);

  useEffect(() => () => resetMapThumbnailCache(), []);

  function currentAccountSyncClient(): MemoryRecallSyncClient | null {
    if (testSyncClient.current) return testSyncClient.current;
    if (!accountSession) return null;
    return new MemoryRecallSyncClient({
      baseUrl: AUTH_API_URL,
      token: accountSession.accessToken,
    });
  }

  async function readRemoteVault(activeAccount: MobileAccountSession): Promise<VaultEnvelopeV1 | null> {
    try {
      return await new MemoryRecallSyncClient({ baseUrl: AUTH_API_URL, token: activeAccount.accessToken }).getVault();
    } catch (error) {
      if (error instanceof SyncRequestError && error.status === 404) return null;
      throw error;
    }
  }

  async function submitAccountLogin(): Promise<void> {
    if (accountLoginName.trim().length < 3) throw new Error('请输入账号。');
    if (accountLoginPassword.length < 8) throw new Error('账号密码至少需要 8 个字符。');
    const login = await loginSyncSession(AUTH_API_URL, {
      loginName: accountLoginName.trim(),
      password: accountLoginPassword,
      deviceId: 'android-mobile',
    });
    const remoteVault = await readRemoteVault(login);
    await saveStoredAccountSession(login);
    setAccountSession(login);
    setAccountLoginPassword('');
    setAuthError('');
    if (remoteVault) {
      await saveVaultEnvelope(remoteVault);
      setVault(remoteVault);
      setMode('locked');
    } else {
      setVault(null);
      setMode('setup');
    }
  }

  async function runTask(task: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setStatus(`失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshMemories(
    activeSession: VaultSessionV1,
    options: { loadThumbnails?: boolean } = {},
  ): Promise<number> {
    const snapshot = await loadDecryptedMemories(
      nativeCryptoPrimitives,
      activeSession,
      cipherSyncStorage,
    );
    memoriesRef.current = snapshot.memories;
    setMemories(snapshot.memories);
    const thumbnailRequestId = ++thumbnailLoadId.current;
    setThumbnailSources({});
    if (options.loadThumbnails !== false) {
      void loadThumbnailRefs(snapshot.memories, activeSession).then((refs) => {
        if (thumbnailRequestId === thumbnailLoadId.current) setThumbnailSources(refs);
      }).catch(() => undefined);
    }
    const withLocationCount = snapshot.memories.filter((memory) => memory.location !== null).length;
    const withValidCoordsCount = snapshot.memories.filter((memory) => (
      memory.location !== null
      && Number.isFinite(memory.location.lat)
      && Number.isFinite(memory.location.lng)
    )).length;
    const mapDtoCount = memoriesToMapMarkers(snapshot.memories).length;
    logMemoryDiagnostics('local-decrypt', {
      localDecryptedCount: snapshot.memories.length,
      decryptFailedCount: snapshot.decryptFailedCount,
      decryptErrorTypes: snapshot.decryptErrorTypes,
      withLocationCount,
      withValidCoordsCount,
      mapDtoCount,
      migratedCount: snapshot.migratedCount,
    });
    latestLocalDiagnostics = `本机解密 ${snapshot.memories.length}，解密失败 ${snapshot.decryptFailedCount}，地点 ${withLocationCount}，有效坐标 ${withValidCoordsCount}，地图 DTO ${mapDtoCount}`;
    return snapshot.migratedCount;
  }

  async function downloadAccountMemories(
    activeSession: VaultSessionV1,
    onDiagnostics?: (diagnostics: CipherSyncDiagnostics) => void,
    onMemoriesStored?: (count: number) => void | Promise<void>,
  ): Promise<{ count: number; conflictIds: string[] }> {
    const client = currentAccountSyncClient();
    if (!client) return { count: 0, conflictIds: [] };
    const download = downloadCiphertext({
      client,
      storage: cipherSyncStorage,
      onDiagnostics: (diagnostics: CipherSyncDiagnostics) => {
        logMemoryDiagnostics('remote-sync', diagnostics);
        onDiagnostics?.(diagnostics);
      },
      onPhotoPerformance: logPhotoPerformance,
      onMemoriesStored,
      decryptMemory: async (memory) => (await decryptMemoryV2(
        nativeCryptoPrimitives,
        activeSession,
        memory,
      )).memory,
    });
    const result = await download;
    return {
      count: result.requiresUnlock || result.importedVault ? 0 : result.memories,
      conflictIds: result.conflictIds,
    };
  }

  async function loadThumbnailRefs(
    values: readonly MemoryV2[],
    activeSession: VaultSessionV1,
  ): Promise<MemoryThumbnailSources> {
    const entries = await Promise.all(values.map(async (memory) => {
      const sources: MemoryMapThumbnail[] = [];
      for (const photoRef of memory.photos.slice(0, 3)) {
        try {
          const encrypted = await getEncryptedPhoto(photoRef.id, 'thumbnail');
          if (!encrypted) continue;
          const photo = await decryptPhoto(nativeCryptoPrimitives, activeSession, encrypted);
          try {
            sources.push(registerMapThumbnail(`thumbnail:${photoRef.id}`, photo.bytes));
          } finally {
            photo.bytes.fill(0);
          }
        } catch {
          // A missing thumbnail is rendered as a location anchor; the memory remains usable.
        }
      }
      return [memory.id, sources] as const;
    }));
    return Object.fromEntries(entries);
  }

  function replaceMemoryInLocalState(memory: MemoryV2): void {
    const next = [
      ...memoriesRef.current.filter((current) => current.id !== memory.id),
      memory,
    ];
    next.sort((left, right) => right.date.localeCompare(left.date));
    memoriesRef.current = next;
    setMemories(next);
    if (!session) return;
    void loadThumbnailRefs([memory], session).then((refs) => {
      setThumbnailSources((current) => ({ ...current, ...refs }));
    }).catch(() => undefined);
  }

  function appendMemoryToLocalState(memory: MemoryV2): void {
    replaceMemoryInLocalState(memory);
  }

  async function finishUnlock(activeSession: VaultSessionV1, message: string): Promise<void> {
    setSession(activeSession);
    setMode('unlocked');
    setPassword('');
    const migratedCount = await refreshMemories(activeSession);
    let downloadedCount = 0;
    let remoteConflictIds: string[] = [];
    const remoteDiagnosticsRef = { current: null as CipherSyncDiagnostics | null };
    let syncWarning = '';
    let readyResolve: (() => void) | undefined;
    const memoryReady = new Promise<void>((resolve) => { readyResolve = resolve; });
    const syncPromise = downloadAccountMemories(activeSession, (diagnostics) => {
      remoteDiagnosticsRef.current = diagnostics;
    }, async () => {
      await refreshMemories(activeSession, { loadThumbnails: false });
      readyResolve?.();
    }).then((downloadResult) => {
      downloadedCount = downloadResult.count;
      remoteConflictIds = downloadResult.conflictIds;
      return refreshMemories(activeSession);
    }).catch((error) => {
      syncWarning = `远端记忆暂时未同步：${errorMessage(error)}`;
      logMemoryDiagnostics('remote-sync-error', { errorType: memoryDiagnosticErrorType(error) });
    }).finally(() => {
      readyResolve?.();
    });

    await memoryReady;
    setStatus(`${message}${migratedCount > 0 ? ` 已将 ${migratedCount} 条旧记忆升级为 MemoryV2。` : ''}正在后台同步远端照片。诊断：${latestLocalDiagnostics}`);
    void syncPromise.then(() => {
      const details = [
        downloadedCount > 0 ? `已同步 ${downloadedCount} 条远端记忆` : '',
        remoteConflictIds.length > 0 ? `有 ${remoteConflictIds.length} 条冲突未覆盖` : '',
      ].filter(Boolean).join('，');
      const diagnosticSummary = remoteDiagnosticsRef.current
        ? `诊断：远端 ${remoteDiagnosticsRef.current.remoteEncryptedCount}，下载 ${remoteDiagnosticsRef.current.storedEncryptedCount}，解密成功 ${remoteDiagnosticsRef.current.decryptSuccessCount}，解密失败 ${remoteDiagnosticsRef.current.decryptFailedCount}，冲突 ${remoteDiagnosticsRef.current.conflictIds.length}，远端地点 ${remoteDiagnosticsRef.current.withLocationCount}，远端有效坐标 ${remoteDiagnosticsRef.current.withValidCoordsCount}；${latestLocalDiagnostics}`
        : `诊断：远端同步未返回数量；${latestLocalDiagnostics}`;
      setStatus(`${message}${details ? ` ${details}。` : ''}${syncWarning ? ` ${syncWarning}` : ' 同步完成。'} ${diagnosticSummary}`);
    });
    if (currentAccountSyncClient() && (pendingAccountUploadPlan.current.memoryIds.length > 0
      || pendingAccountUploadPlan.current.photoRefs.length > 0)) {
      queueAccountUpload(
        { memoryIds: [], photoRefs: [] },
        () => '本地待同步变更已在后台继续上传。',
        (error) => `本地待同步变更仍未上传：${errorMessage(error)}。`,
      );
    }
  }

  function lock(): void {
    detailLoadId.current += 1;
    if (session) destroyVaultSession(session);
    setSession(null);
    setMemories([]);
    setThumbnailSources({});
    resetMapThumbnailCache();
    setSelectedYear(null);
    setSelectedMemory(null);
    setEditDraft(null);
    setDraftVisible(false);
    editPendingPhotoPool.current.clear();
    setPhotoManageVisible(false);
    setMoreActionsVisible(false);
    setDeleteConfirmVisible(false);
    setLocationPickerVisible(false);
    setDetailPhotoUris([]);
    setDetailPhotoStates([]);
    setPreviewUri(null);
    setMode(vault ? 'locked' : 'setup');
    setStatus('私密空间已经锁定，内存钥匙已清零。');
  }

  async function createPrivateSpace(): Promise<void> {
    if (password.length < 8) {
      throw new Error('私密空间密码至少需要 8 个字符。');
    }
    if (password !== passwordConfirmation) {
      throw new Error('两次输入的密码不一致。');
    }
    setStatus('正在用 64 MiB Argon2id 创建私密空间……');
    const startedAt = performance.now();
    const created = await createVault(nativeCryptoPrimitives, password);
    await saveVaultEnvelope(created.envelope);
    if (accountSession) {
      await new MemoryRecallSyncClient({ baseUrl: AUTH_API_URL, token: accountSession.accessToken }).putVault(created.envelope);
    }
    setVault(created.envelope);
    setPasswordConfirmation('');
    await finishUnlock(
      created.session,
      `私密空间创建完成，用时 ${Math.round(performance.now() - startedAt)} ms。`,
    );
  }

  async function unlockWithPassword(): Promise<void> {
    if (!vault) throw new Error('本机没有可解锁的私密空间。');
    setStatus('正在派生解锁钥匙……');
    const startedAt = performance.now();
    const activeSession = await unlockVault(nativeCryptoPrimitives, vault, password);
    await finishUnlock(
      activeSession,
      `密码解锁成功，用时 ${Math.round(performance.now() - startedAt)} ms。`,
    );
  }

  async function quickUnlock(): Promise<void> {
    if (!vault) throw new Error('本机没有可解锁的私密空间。');
    setStatus('等待系统指纹验证……');
    const startedAt = performance.now();
    const activeSession = await unlockWithDevice(vault);
    await finishUnlock(
      activeSession,
      `本机指纹解锁成功，用时 ${Math.round(performance.now() - startedAt)} ms。`,
    );
  }

  async function rememberThisDevice(): Promise<void> {
    if (!session) throw new Error('请先解锁。');
    await enableDeviceUnlock(session);
    setDeviceUnlockEnabled(true);
    setStatus('设备钥匙已写入 Android Keystore；VMK 本身没有直接保存。');
  }

  async function pickPendingPhotos(): Promise<PendingPhotoSelection | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('没有获得照片访问权限。');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 0,
      orderedSelection: true,
      exif: true,
      quality: 1,
    });
    if (result.canceled) return null;
    const photos: PendingPhoto[] = [];
    for (const [index, asset] of result.assets.entries()) {
      const byteLength = asset.fileSize ?? new File(asset.uri).size;
      if (byteLength === null) throw new Error('无法读取所选照片的大小。');
      if (byteLength > MAX_PHOTO_BYTES) {
        throw new Error(`照片“${asset.fileName ?? index + 1}”超过 30MB。`);
      }
      photos.push({
        uri: asset.uri,
        filename: asset.fileName ?? `photo-${Date.now()}-${index}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
      });
    }
    return {
      photos,
      coordinates: firstPhotoCoordinates(result.assets.map((asset) => asset.exif)),
    };
  }

  async function resolvePhotoLocation(coordinates: PhotoCoordinates): Promise<MemoryLocationV2> {
    if (!mobileLocationClient) return fallbackPhotoLocation(coordinates);
    try {
      const converted = await mobileLocationClient.convertGps(coordinates);
      if (!converted) return fallbackPhotoLocation(coordinates);
      const reverse = await mobileLocationClient.reverse(converted);
      if (reverse) return normalizeLocationResult(reverse);
      return { ...fallbackPhotoLocation(converted), provider: 'amap' };
    } catch {
      return fallbackPhotoLocation(coordinates);
    }
  }

  async function beginCreateMemory(): Promise<void> {
    if (editDraft?.kind === 'create' && !draftVisible) {
      setDraftVisible(true);
      setStatus('已恢复尚未完成的新建草稿。');
      return;
    }
    if (editDraft) return;
    const selection = await pickPendingPhotos();
    if (!selection || selection.photos.length === 0) return;
    setStatus(selection.coordinates ? '正在读取照片拍摄地点……' : '正在创建记忆草稿……');
    const photoLocation = selection.coordinates
      ? await resolvePhotoLocation(selection.coordinates)
      : null;
    setEditDraft({
      kind: 'create',
      original: null,
      baseVersion: null,
      title: '',
      date: todayValue(),
      pastSelf: '',
      presentSelf: '',
      location: photoLocation,
      photos: [],
      pendingPhotos: selection.photos,
    });
    editPendingPhotoPool.current = new Map(
      selection.photos.map((photo) => [`pending:${photo.uri}`, photo]),
    );
    setDraftVisible(true);
    if (photoLocation && Number.isFinite(photoLocation.lat) && Number.isFinite(photoLocation.lng)) {
      setHomeViewport((current) => ({
        camera: {
          latitude: photoLocation.lat!,
          longitude: photoLocation.lng!,
          zoom: current.camera.zoom,
        },
      }));
    }
    setStatus(photoLocation
      ? `已从照片读取地点：${photoLocation.name}。`
      : `已选择 ${selection.photos.length} 张照片，请继续编辑记忆。`);
  }

  async function encryptPendingPhoto(activeSession: VaultSessionV1, pending: PendingPhoto): Promise<MemoryPhotoV1> {
    const photoId = nativeCryptoPrimitives.randomUUID();
    const startedAt = performance.now();
    const durationsMs: Record<string, number> = {};
    let totalBytes = 0;
    try {
      const variantStartedAt = performance.now();
      const variantBytes = await Promise.all(PHOTO_VARIANT_SPECS.map(async (spec) => {
        const specStartedAt = performance.now();
        const bytes = await createJpegPhotoVariant(pending.uri, pending.width, pending.height, spec);
        durationsMs[`resize-${spec.kind}`] = performance.now() - specStartedAt;
        totalBytes += bytes.byteLength;
        return { spec, bytes };
      }));
      durationsMs['variant-total'] = performance.now() - variantStartedAt;
      try {
        const encryptedVariants = await Promise.all(variantBytes.map(async ({ spec, bytes }) => {
          const encryptStartedAt = performance.now();
          const encrypted = await encryptPhoto(
            nativeCryptoPrimitives,
            activeSession,
            bytes,
            { filename: pending.filename, mimeType: 'image/jpeg' },
            { id: photoId, kind: spec.kind },
          );
          durationsMs[`encrypt-${spec.kind}`] = performance.now() - encryptStartedAt;
          return encrypted;
        }));
        const saveStartedAt = performance.now();
        await Promise.all(encryptedVariants.map(saveEncryptedPhoto));
        durationsMs['storage-write-variants'] = performance.now() - saveStartedAt;
      } finally {
        variantBytes.forEach(({ bytes }) => bytes.fill(0));
      }
      const plaintextFile = new File(pending.uri);
      if (plaintextFile.size !== null && plaintextFile.size > MAX_PHOTO_BYTES) {
        throw new Error('照片不能超过 30MB。');
      }
      const originalReadStartedAt = performance.now();
      const photoBytes = await plaintextFile.bytes();
      durationsMs['original-read'] = performance.now() - originalReadStartedAt;
      totalBytes += photoBytes.byteLength;
      try {
        const originalEncryptStartedAt = performance.now();
        const encryptedOriginal = await encryptPhoto(
          nativeCryptoPrimitives,
          activeSession,
          photoBytes,
          { filename: pending.filename, mimeType: pending.mimeType },
          { id: photoId, kind: 'original' },
        );
        durationsMs['encrypt-original'] = performance.now() - originalEncryptStartedAt;
        const originalSaveStartedAt = performance.now();
        await saveEncryptedPhoto(encryptedOriginal);
        durationsMs['storage-write-original'] = performance.now() - originalSaveStartedAt;
      } finally {
        photoBytes.fill(0);
      }
      logPhotoPerformance({
        operation: 'encrypt',
        bytes: totalBytes,
        durationsMs: { ...durationsMs, total: performance.now() - startedAt },
      });
      return { id: photoId, mimeType: pending.mimeType };
    } catch (error) {
      await deleteEncryptedPhotoVariants(photoId).catch(() => undefined);
      throw error;
    }
  }

  async function cleanupUnreferencedLocalPhotos(photoIds: readonly string[], excludedMemoryId?: string): Promise<void> {
    if (photoIds.length === 0) return;
    const referenced = new Set<string>();
    if (session) {
      for (const encryptedMemory of await listEncryptedMemories()) {
        if (encryptedMemory.deleted || encryptedMemory.id === excludedMemoryId) continue;
        try {
          const value = (await decryptMemoryV2(nativeCryptoPrimitives, session, encryptedMemory)).memory;
          for (const photo of value.photos) referenced.add(photo.id);
        } catch {
          // A malformed unrelated memory must not prevent local orphan cleanup.
        }
      }
    }
    for (const photoId of photoIds) {
      if (!referenced.has(photoId)) await deleteEncryptedPhotoVariants(photoId);
    }
  }

  async function openEditMemory(): Promise<void> {
    if (!selectedMemory) return;
    const current = (await listEncryptedMemories()).find((memory) => memory.id === selectedMemory.id);
    if (!current || current.deleted) throw new Error('这条记忆已经不存在。');
    setMoreActionsVisible(false);
    setEditDraft({
      kind: 'edit',
      original: selectedMemory,
      baseVersion: current.version,
      title: selectedMemory.title,
      date: selectedMemory.date,
      pastSelf: selectedMemory.pastSelf,
      presentSelf: selectedMemory.presentSelf,
      location: selectedMemory.location ? { ...selectedMemory.location } : null,
      photos: selectedMemory.photos.map((photo) => ({ ...photo })),
      pendingPhotos: [],
    });
    setDraftVisible(true);
    editPendingPhotoPool.current.clear();
  }

  function cancelEdit(): void {
    setPhotoManageVisible(false);
    if (editDraft?.kind === 'create') {
      setDraftVisible(false);
      setStatus('新建草稿已保留在本机当前会话中。');
      return;
    }
    setEditDraft(null);
    setDraftVisible(false);
    editPendingPhotoPool.current.clear();
    setStatus('已取消编辑，原记忆没有变化。');
  }

  function editPhotoKey(photo: PendingPhoto): string {
    return `pending:${photo.uri}`;
  }

  function editPhotoItems(draft: EditDraftState): PhotoManageItem[] {
    const uriById = new Map<string, string | null>();
    if (selectedMemory) {
      selectedMemory.photos.forEach((photo, index) => uriById.set(photo.id, detailPhotoUris[index] ?? null));
    }
    return [
      ...draft.photos.map((photo) => ({
        id: photo.id,
        mimeType: photo.mimeType,
        uri: uriById.get(photo.id) ?? null,
        pending: false,
      })),
      ...draft.pendingPhotos.map((photo) => ({
        id: editPhotoKey(photo),
        mimeType: photo.mimeType,
        uri: photo.uri,
        pending: true,
      })),
    ];
  }

  function editPhotoUris(draft: EditDraftState): Array<string | null> {
    const uriById = new Map<string, string | null>();
    if (selectedMemory) {
      selectedMemory.photos.forEach((photo, index) => uriById.set(photo.id, detailPhotoUris[index] ?? null));
    }
    return [
      ...draft.photos.map((photo) => uriById.get(photo.id) ?? null),
      ...draft.pendingPhotos.map((photo) => photo.uri),
    ];
  }

  async function addDraftPhotos(): Promise<PhotoManageItem[]> {
    const selection = await pickPendingPhotos();
    if (!selection) return [];
    for (const photo of selection.photos) {
      editPendingPhotoPool.current.set(editPhotoKey(photo), photo);
    }
    if (editDraft?.kind === 'create' && !editDraft.location && selection.coordinates) {
      const photoLocation = await resolvePhotoLocation(selection.coordinates);
      setEditDraft((current) => current?.kind === 'create' && !current.location
        ? { ...current, location: photoLocation }
        : current);
    }
    return selection.photos.map((photo) => ({
      id: editPhotoKey(photo),
      mimeType: photo.mimeType,
      uri: photo.uri,
      pending: true,
    }));
  }

  function completePhotoManage(items: PhotoManageItem[]): void {
    if (!editDraft) return;
    const pendingByKey = new Map([
      ...editDraft.pendingPhotos.map((photo) => [editPhotoKey(photo), photo] as const),
      ...editPendingPhotoPool.current.entries(),
    ]);
    const selection = mergePhotoManageSelection(items, pendingByKey);
    const nextPendingPhotos = selection.pendingPhotos;
    setEditDraft({
      ...editDraft,
      photos: selection.photos,
      pendingPhotos: nextPendingPhotos,
    });
    editPendingPhotoPool.current = new Map(nextPendingPhotos.map((photo) => [editPhotoKey(photo), photo]));
    setPhotoManageVisible(false);
  }

  function cancelPhotoManage(): void {
    editPendingPhotoPool.current = new Map(
      editDraft?.pendingPhotos.map((photo) => [editPhotoKey(photo), photo]) ?? [],
    );
    setPhotoManageVisible(false);
  }

  function openEditLocation(): void {
    locationPickerOriginCamera.current = homeViewport.camera;
    setHomeCameraTarget(null);
    setLocationPickerVisible(true);
  }

  async function saveEditedMemory(): Promise<void> {
    if (!session || !editDraft) return;
    const draft = editDraft;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw new Error('日期请使用 YYYY-MM-DD 格式。');
    if (draft.kind === 'edit' && !draft.title.trim()) throw new Error('标题不能为空。');

    const current = draft.kind === 'edit' && draft.original
      ? (await listEncryptedMemories()).find((memory) => memory.id === draft.original!.id) ?? null
      : null;
    if (draft.kind === 'edit') {
      if (!draft.original || draft.baseVersion === null || !current || current.deleted) {
        throw new Error('这条记忆已经被删除。');
      }
      if (current.version !== draft.baseVersion) {
        throw new Error('这条记忆已在其他位置更新，请重新打开后再编辑。');
      }
    }

    setStatus(draft.kind === 'create' ? '正在加密照片并创建记忆……' : '正在保存编辑并加密照片……');
    const newlyEncryptedIds: string[] = [];
    const nextPhotos = [...draft.photos];
    try {
      for (const pending of draft.pendingPhotos) {
        const photo = await encryptPendingPhoto(session, pending);
        newlyEncryptedIds.push(photo.id);
        nextPhotos.push(photo);
      }

      const now = new Date().toISOString();
      if (draft.kind === 'create') {
        const nextMemory = buildCreatedMemory(
          draft,
          nextPhotos,
          nativeCryptoPrimitives.randomUUID(),
          now,
        );
        await saveEncryptedMemory(await encryptMemoryV2(
          nativeCryptoPrimitives,
          session,
          nextMemory,
        ));
        appendMemoryToLocalState(nextMemory);
        setEditDraft(null);
        setDraftVisible(false);
        setPhotoManageVisible(false);
        editPendingPhotoPool.current.clear();
        if (!currentAccountSyncClient()) {
          setStatus('新记忆已加密保存到本机。');
          return;
        }
        setStatus('新记忆已保存到本机；正在后台同步云端。');
        queueAccountUpload(
          {
            memoryIds: [nextMemory.id],
            photoRefs: photoRefsForIds(newlyEncryptedIds),
          },
          (result) => `新记忆已保存并同步（${result.memories} 条记忆密文，${result.photos} 份照片密文）。`,
          (error) => `新记忆已保存到本机，云端同步失败：${errorMessage(error)}。下次点击完成时会重试。`,
        );
        return;
      }

      if (!draft.original || !current) throw new Error('这条记忆已经不存在。');
      const nextMemory = buildEditedMemory(
        draft.original,
        draft,
        nextPhotos,
        now,
      );
      await saveEncryptedMemory(await encryptMemoryV2(
        nativeCryptoPrimitives,
        session,
        nextMemory,
        current.version + 1,
      ));

      const orphanedPhotoIds = removedPhotoIds(draft.original.photos, nextPhotos);
      replaceMemoryInLocalState(nextMemory);
      setEditDraft(null);
      setDraftVisible(false);
      setPhotoManageVisible(false);
      editPendingPhotoPool.current.clear();
      openMemory(nextMemory);
      void cleanupUnreferencedLocalPhotos(orphanedPhotoIds, nextMemory.id).catch(() => undefined);
      if (!currentAccountSyncClient()) {
        setStatus('编辑已加密保存到本机。');
        return;
      }
      setStatus('编辑已保存到本机；正在后台同步云端。');
      queueAccountUpload(
        {
          memoryIds: [nextMemory.id],
          photoRefs: photoRefsForIds(newlyEncryptedIds),
        },
        (result) => `编辑已保存并同步（${result.memories} 条记忆密文，${result.photos} 份照片密文）。`,
        (error) => `编辑已保存到本机，云端同步失败：${errorMessage(error)}。下次点击完成时会重试。`,
      );
    } catch (error) {
      for (const photoId of newlyEncryptedIds) await deleteEncryptedPhotoVariants(photoId).catch(() => undefined);
      throw error;
    }
  }

  async function deleteSelectedMemory(): Promise<void> {
    if (!session || !selectedMemory) return;
    setStatus('正在生成删除标记……');
    const current = (await listEncryptedMemories()).find((memory) => memory.id === selectedMemory.id);
    if (!current) throw new Error('这条记忆已经不存在。');
    if (current.deleted) throw new Error('这条记忆已经被删除。');
    await saveEncryptedMemory(createDeleteTombstone(current));
    const deletedPhotoIds = selectedMemory.photos.map((photo) => photo.id);
    closeMemory();
    setMoreActionsVisible(false);
    setDeleteConfirmVisible(false);
    setMemories((currentMemories) => currentMemories.filter((memory) => memory.id !== selectedMemory.id));
    setThumbnailSources((currentSources) => {
      const next = { ...currentSources };
      delete next[selectedMemory.id];
      return next;
    });
    void cleanupUnreferencedLocalPhotos(deletedPhotoIds, selectedMemory.id).catch(() => undefined);
    if (!currentAccountSyncClient()) {
      setStatus('记忆已从本机删除，并生成删除标记。');
      return;
    }
    setStatus('记忆已从本机删除；正在后台同步删除标记。');
    queueAccountUpload(
      { memoryIds: [selectedMemory.id], photoRefs: [] },
      (result) => `记忆已删除并同步（${result.memories} 条记忆密文）。COS 中未引用的照片密文等待后续 GC。`,
      (error) => `记忆已从本机删除，删除标记尚未同步：${errorMessage(error)}。下次点击完成时会重试。`,
    );
  }

  async function readDetailPhotoVariant(photoId: string, kind: PhotoKind) {
    const local = await getEncryptedPhoto(photoId, kind);
    const client = currentAccountSyncClient();
    if (local || !client) return local;
    try {
      const remote = await client.getPhotoVariant(photoId, kind);
      await saveEncryptedPhoto(remote);
      return remote;
    } catch (error) {
      if (!(error instanceof PhotoVariantNotFoundError)) throw error;
      return null;
    }
  }

  async function loadDetailPhoto(memory: MemoryV2, index: number, requestId: number): Promise<void> {
    const photoId = memory.photos[index]?.id;
    if (!session || !photoId) return;
    const startedAt = performance.now();
    const durationsMs: Record<string, number> = {};
    try {
      // Prefer the sharper preview, but keep older memories usable when only
      // a thumbnail was uploaded. Check cancellation between each async step
      // so closing detail never triggers a second remote fetch.
      const previewReadStartedAt = performance.now();
      let encrypted = await readDetailPhotoVariant(photoId, 'preview');
      durationsMs['read-preview'] = performance.now() - previewReadStartedAt;
      if (requestId !== detailLoadId.current) return;
      if (!encrypted) {
        const thumbnailReadStartedAt = performance.now();
        encrypted = await readDetailPhotoVariant(photoId, 'thumbnail');
        durationsMs['read-thumbnail'] = performance.now() - thumbnailReadStartedAt;
        if (requestId !== detailLoadId.current) return;
      }
      if (!encrypted) throw new Error('找不到照片密文。');
      if (requestId !== detailLoadId.current) return;
      const decryptStartedAt = performance.now();
      const photo = await decryptPhoto(nativeCryptoPrimitives, session, encrypted);
      durationsMs.decrypt = performance.now() - decryptStartedAt;
      if (requestId !== detailLoadId.current) {
        photo.bytes.fill(0);
        return;
      }
      const photoBytes = photo.bytes.byteLength;
      const base64StartedAt = performance.now();
      const uri = `data:${photo.metadata.mimeType};base64,${bytesToBase64(photo.bytes)}`;
      durationsMs.base64 = performance.now() - base64StartedAt;
      photo.bytes.fill(0);
      if (requestId !== detailLoadId.current) return;
      detailPhotoPerformance.current.set(index, {
        startedAt,
        durationsMs,
        bytes: photoBytes,
        displayStartedAt: performance.now(),
      });
      setDetailPhotoUris((current) => current.map((value, currentIndex) => currentIndex === index ? uri : value));
      setDetailPhotoStates((current) => current.map((value, currentIndex) => currentIndex === index ? 'ready' : value));
    } catch (error) {
      detailPhotoPerformance.current.delete(index);
      if (requestId !== detailLoadId.current) return;
      setDetailPhotoStates((current) => current.map((value, currentIndex) => currentIndex === index ? 'unavailable' : value));
      logMemoryDiagnostics('detail-photo-error', { memoryId: memory.id, photoId, index, errorType: memoryDiagnosticErrorType(error) });
    }
  }

  function markDetailPhotoDisplayed(index: number): void {
    const metric = detailPhotoPerformance.current.get(index);
    if (!metric || metric.displayStartedAt === undefined) return;
    detailPhotoPerformance.current.delete(index);
    logPhotoPerformance({
      operation: 'detail',
      bytes: metric.bytes,
      durationsMs: {
        ...metric.durationsMs,
        display: performance.now() - metric.displayStartedAt,
        total: performance.now() - metric.startedAt,
      },
    });
  }

  function openMemory(memory: MemoryV2): void {
    const requestId = ++detailLoadId.current;
    detailPhotoPerformance.current.clear();
    setSelectedMemory(memory);
    setPreviewUri(null);
    setDetailPhotoUris(memory.photos.map(() => null));
    setDetailPhotoStates(memory.photos.map(() => 'loading' as DetailPhotoState));
    setStatus(`已打开记忆：${memory.title}。`);
    for (let index = 0; index < memory.photos.length; index += 1) {
      void loadDetailPhoto(memory, index, requestId);
    }
  }

  function closeMemory(): void {
    detailLoadId.current += 1;
    detailPhotoPerformance.current.clear();
    setSelectedMemory(null);
    setDetailPhotoUris([]);
    setDetailPhotoStates([]);
    setPreviewUri(null);
  }

  function confirmLocation(next: MemoryLocationV2): void {
    locationPickerOriginCamera.current = null;
    setEditDraft((current) => current ? { ...current, location: next } : current);
    if (Number.isFinite(next.lat) && Number.isFinite(next.lng)) {
      setHomeViewport((current) => ({
        camera: {
          latitude: next.lat!,
          longitude: next.lng!,
          zoom: current.camera.zoom,
        },
      }));
    }
    setHomeCameraTarget(null);
    setLocationCameraTarget(null);
    setLocationPickerVisible(false);
  }

  function cancelLocationPicker(): void {
    const origin = locationPickerOriginCamera.current;
    if (origin) setHomeViewport({ camera: origin });
    locationPickerOriginCamera.current = null;
    setHomeCameraTarget(null);
    setLocationCameraTarget(null);
    setLocationPickerVisible(false);
  }

  async function submitAuthEntry(): Promise<void> {
    setAuthError('');
    try {
      if (mode === 'account') await submitAccountLogin();
      else if (mode === 'setup') await createPrivateSpace();
      else if (mode === 'locked') await unlockWithPassword();
    } catch (error) {
      setAuthError(errorMessage(error));
      throw error;
    }
  }

  function handleMarkerPress({ markerId }: MapMarkerPressEvent): void {
    const memory = findMemoryForMarker(memories, markerId);
    if (!memory) {
      setStatus(`地图返回了未知地点：${markerId}`);
      return;
    }
    const memoryLocation = memory.location;
    if (!memoryLocation) {
      setStatus('这条记忆没有可用的地图坐标。');
      return;
    }
    void runTask(async () => { openMemory(memory); });
  }

  function handleHomeCameraIdle(event: MapCameraIdleEvent): void {
    setHomeViewport(event);
    setHomeCameraTarget(null);
  }

  function selectHomeRegion(region: HomeRegionOption): void {
    setHomeCameraTarget(region.camera);
    setStatus(`已定位到${region.label}：${region.memoryCount} 段记忆。`);
  }

  function resetHomeMapView(): void {
    setHomeCameraTarget({ ...HOME_CHINA_CAMERA });
  }

  async function exportBundle(): Promise<void> {
    if (!vault) throw new Error('没有可导出的私密空间。');
    await shareEncryptedBundle(vault);
    setStatus('已调用系统分享导出加密 JSON；文件中不含密码和明文。');
  }

  async function importBundle(): Promise<void> {
    const bundle = await pickEncryptedBundle();
    if (!bundle) return;
    if (session) destroyVaultSession(session);
    detailLoadId.current += 1;
    await disableDeviceUnlock();
    await replaceWithEncryptedBundle(bundle);
    setVault(bundle.vault);
    setSession(null);
    setMemories([]);
    setThumbnailSources({});
    resetMapThumbnailCache();
    setSelectedYear(null);
    setSelectedMemory(null);
    setDetailPhotoUris([]);
    setDetailPhotoStates([]);
    setPreviewUri(null);
    setDeviceUnlockEnabled(false);
    setMode('locked');
    setStatus('加密包已导入，请输入它原来的私密空间密码。');
  }

  async function runCompatibility(): Promise<void> {
    setStatus('正在运行 Android 原生 64 MiB Argon2id 与网页密文兼容测试……');
    const result = await runNativeCompatibilityCheck();
    setStatus(
      `兼容测试通过：AES-GCM ${Math.round(result.aesMilliseconds)} ms；Argon2id ${Math.round(result.argon2Milliseconds)} ms；网页 VMK/文字/照片解密 ${Math.round(result.webBundleMilliseconds)} ms。`,
    );
  }

  function createSyncClient(): MemoryRecallSyncClient {
    if (!syncUrl.trim()) throw new Error('请输入本地密文服务地址。');
    if (!syncToken.trim()) throw new Error('请输入本地访问令牌。');
    return new MemoryRecallSyncClient({
      baseUrl: syncUrl.trim(),
      token: syncToken.trim(),
    });
  }

  async function loginToSyncService(): Promise<void> {
    if (!syncUrl.trim()) throw new Error('请输入密文服务地址。');
    if (syncLoginName.trim().length < 3) throw new Error('请输入受邀请账号。');
    if (syncLoginPassword.length < 8) throw new Error('登录密码至少需要 8 个字符。');
    const login = await loginSyncSession(syncUrl.trim(), {
      loginName: syncLoginName.trim(),
      password: syncLoginPassword,
      deviceId: 'android-prototype',
    });
    setSyncToken(login.accessToken);
    setSyncSessionExpiresAt(login.expiresAt);
    setSyncLoginPassword('');
    setStatus(`同步账号登录成功，会话有效至 ${new Date(login.expiresAt).toLocaleString()}。`);
  }

  async function logoutFromSyncService(): Promise<void> {
    await createSyncClient().logout();
    setSyncToken('');
    setSyncSessionExpiresAt(null);
    setStatus('已退出同步账号，当前访问令牌已撤销。');
  }

  async function toggleSyncAuthMode(): Promise<void> {
    if (syncAuthMode === 'account' && syncToken) {
      await createSyncClient().logout();
    }
    setSyncToken('');
    setSyncSessionExpiresAt(null);
    setSyncLoginPassword('');
    setSyncAuthMode((current) => (current === 'account' ? 'token' : 'account'));
    setStatus(syncAuthMode === 'account' ? '已切换到本地固定令牌模式。' : '已切换到受邀请账号登录。');
  }

  async function uploadLocalCiphertext(): Promise<void> {
    setStatus('正在把本机密文发送到本地服务……');
    const result = await uploadCiphertext(createSyncClient(), cipherSyncStorage, {
      onPhotoPerformance: logPhotoPerformance,
    });
    setStatus(`上传完成：${result.memories} 条记忆密文，${result.photos} 份照片密文。`);
  }

  async function uploadAccountCiphertext(
    plan?: UploadPlan,
  ): Promise<Awaited<ReturnType<typeof uploadCiphertext>>> {
    const client = currentAccountSyncClient();
    if (!client) throw new Error('请先登录账号。');
    return uploadCiphertext(
      client,
      cipherSyncStorage,
      { onPhotoPerformance: logPhotoPerformance, plan },
    );
  }

  function queueAccountUpload(
    plan: UploadPlan,
    onSuccess: (result: Awaited<ReturnType<typeof uploadCiphertext>>) => string,
    onFailure: (error: unknown) => string,
  ): void {
    if (!currentAccountSyncClient()) return;
    pendingAccountUploadPlan.current = mergeUploadPlans(pendingAccountUploadPlan.current, plan);
    const durablePlan = activeAccountUploadPlan.current
      ? mergeUploadPlans(activeAccountUploadPlan.current, pendingAccountUploadPlan.current)
      : pendingAccountUploadPlan.current;
    void persistPendingAccountUploadPlan(durablePlan);
    pendingAccountUploadMessages.current.push({ onSuccess, onFailure });
    if (accountUploadQueue.current) return;
    const run = (async () => {
      const persisted = await getPendingUploadPlan();
      if (persisted) {
        pendingAccountUploadPlan.current = mergeUploadPlans(persisted, pendingAccountUploadPlan.current);
      }
      while (pendingAccountUploadPlan.current.memoryIds.length > 0
        || pendingAccountUploadPlan.current.photoRefs.length > 0) {
        const currentPlan = pendingAccountUploadPlan.current;
        pendingAccountUploadPlan.current = { memoryIds: [], photoRefs: [] };
        const messages = pendingAccountUploadMessages.current.splice(0);
        activeAccountUploadPlan.current = currentPlan;
        try {
          const result = await uploadAccountCiphertext(currentPlan);
          activeAccountUploadPlan.current = null;
          await persistPendingAccountUploadPlan(
            pendingAccountUploadPlan.current.memoryIds.length > 0
              || pendingAccountUploadPlan.current.photoRefs.length > 0
              ? pendingAccountUploadPlan.current
              : null,
          );
          for (const message of messages) setStatus(message.onSuccess(result));
        } catch (error) {
          pendingAccountUploadPlan.current = mergeUploadPlans(currentPlan, pendingAccountUploadPlan.current);
          activeAccountUploadPlan.current = null;
          await persistPendingAccountUploadPlan(pendingAccountUploadPlan.current);
          logMemoryDiagnostics('upload-error', { errorType: memoryDiagnosticErrorType(error) });
          for (const message of messages) setStatus(message.onFailure(error));
          break;
        }
      }
    })().finally(() => {
      activeAccountUploadPlan.current = null;
      accountUploadQueue.current = null;
    });
    accountUploadQueue.current = run;
  }

  async function downloadRemoteCiphertext(): Promise<void> {
    setStatus('正在从本地服务下载密文……');
    const result = await downloadCiphertext({
      client: createSyncClient(),
      storage: cipherSyncStorage,
      decryptMemory: session
        ? async (memory) => (await decryptMemoryV2(
          nativeCryptoPrimitives,
          session,
          memory,
        )).memory
        : undefined,
    });

    if (result.importedVault) {
      const downloadedVault = await getVaultEnvelope();
      await disableDeviceUnlock();
      setVault(downloadedVault);
      setDeviceUnlockEnabled(false);
      setMode('locked');
      setStatus('钥匙信封已下载。请输入原私密空间密码解锁，再点一次下载密文。');
      return;
    }
    if (result.requiresUnlock) {
      setStatus('钥匙信封一致。请先解锁私密空间，再下载记忆和照片密文。');
      return;
    }
    if (session) await refreshMemories(session);
    setStatus(`下载完成：${result.memories} 条记忆密文，${result.photos} 份照片密文。`);
  }

  function confirmClear(): void {
    Alert.alert(
      '清空本机原型？',
      '这会删除本机密文和设备解锁钥匙。请先导出备份。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: () => void runTask(async () => {
            if (session) destroyVaultSession(session);
            detailLoadId.current += 1;
            await disableDeviceUnlock();
            await clearEncryptedContent();
            setVault(null);
            setSession(null);
            setMemories([]);
            setThumbnailSources({});
            resetMapThumbnailCache();
            setSelectedYear(null);
            setSelectedMemory(null);
            setDetailPhotoUris([]);
            setDetailPhotoStates([]);
            setPreviewUri(null);
            setDeviceUnlockEnabled(false);
            setMode('setup');
            setStatus('本机原型数据已经清空。');
          }),
        },
      ],
    );
  }

  if (mode !== 'unlocked') {
    const authPhase: AuthEntryPhase = mode === 'loading'
      ? 'booting'
      : mode === 'account'
        ? 'account'
        : mode === 'locked'
          ? 'locked'
          : 'setup';
    return (
      <>
        <StatusBar style="dark" />
        <AuthEntryScreen
          phase={authPhase}
          accountValue={accountLoginName}
          accountPassword={accountLoginPassword}
          privatePassword={password}
          privatePasswordConfirmation={passwordConfirmation}
          showAccountPassword={showAccountPassword}
          showPrivatePassword={showPrivatePassword}
          error={authError}
          busy={busy}
          onAccountChange={setAccountLoginName}
          onAccountPasswordChange={setAccountLoginPassword}
          onPrivatePasswordChange={setPassword}
          onPrivatePasswordConfirmationChange={setPasswordConfirmation}
          onToggleAccountPassword={() => setShowAccountPassword((value) => !value)}
          onTogglePrivatePassword={() => setShowPrivatePassword((value) => !value)}
          onTogglePrivatePasswordConfirmation={() => setShowPrivatePassword((value) => !value)}
          onSubmit={() => void runTask(submitAuthEntry)}
        />
      </>
    );
  }

  return (
    <View style={styles.homeRoot}>
      <StatusBar style="dark" />
      <HomeScreen
        markers={mapMarkers}
        memories={memories}
        selectedYear={selectedYear}
        regionLabel={homeRegionLabel}
        regionOptions={homeRegionOptions}
        loading={busy && memories.length === 0}
        status={status}
        onYearChange={setSelectedYear}
        onRegionSelect={selectHomeRegion}
        onMarkerPress={handleMarkerPress}
        onClusterPress={({ count, label, coordinate }) => setStatus(
          label
            ? `${label}有 ${count} 段记忆，已展开该区域。`
            : `已展开 ${count} 段记忆：${coordinate.latitude.toFixed(3)}, ${coordinate.longitude.toFixed(3)}。`,
        )}
        onCameraIdle={handleHomeCameraIdle}
        onCreateMemory={() => void runTask(beginCreateMemory)}
        onResetMapView={resetHomeMapView}
        chromeVisible={!selectedMemory && !draftVisible && !locationPickerVisible}
        initialCamera={HOME_CHINA_CAMERA}
        camera={locationPickerVisible ? locationCameraTarget : homeCameraTarget}
        mapUpdatesPaused={Boolean(selectedMemory || draftVisible || locationPickerVisible)}
        locationMode={locationPickerVisible}
        locationOverlay={locationPickerVisible ? (
          <LocationPicker
            mapAlreadyMounted
            active={locationPickerVisible}
            initialLocation={editDraft?.location ?? null}
            initialCamera={homeViewport.camera}
            cameraIdle={homeViewport.camera}
            camera={locationCameraTarget}
            locationClient={mobileLocationClient}
            onCameraChange={setLocationCameraTarget}
            onCancel={cancelLocationPicker}
            onConfirm={confirmLocation}
          />
        ) : null}
      />
      {selectedMemory && !editDraft && (
        <MemoryDetailOverlay
          memory={selectedMemory}
          photoUris={detailPhotoUris}
          photoStates={detailPhotoStates}
          onClose={closeMemory}
          onMore={() => setMoreActionsVisible(true)}
          onPhotoDisplayed={markDetailPhotoDisplayed}
        />
      )}
      {editDraft && draftVisible && !photoManageVisible && !locationPickerVisible && (
        <MemoryEditOverlay
          mode={editDraft.kind}
          title={editDraft.title}
          date={editDraft.date}
          pastSelf={editDraft.pastSelf}
          presentSelf={editDraft.presentSelf}
          location={editDraft.location}
          photoCount={editDraft.photos.length + editDraft.pendingPhotos.length}
          photoUris={editPhotoUris(editDraft)}
          busy={busy}
          onChange={(field, value) => setEditDraft((current) => current ? { ...current, [field]: value } : current)}
          onLocation={openEditLocation}
          onManagePhotos={() => setPhotoManageVisible(true)}
          onCancel={cancelEdit}
          onSave={() => void runTask(saveEditedMemory)}
        />
      )}
      {editDraft && draftVisible && photoManageVisible && !locationPickerVisible && (
        <MemoryPhotoManageOverlay
          items={editPhotoItems(editDraft)}
          onAddPhotos={addDraftPhotos}
          onCancel={cancelPhotoManage}
          onComplete={completePhotoManage}
        />
      )}
      {selectedMemory && moreActionsVisible && !deleteConfirmVisible && (
        <MemoryActionsSheet
          onEdit={() => void runTask(openEditMemory)}
          onDelete={() => { setMoreActionsVisible(false); setDeleteConfirmVisible(true); }}
          onCancel={() => setMoreActionsVisible(false)}
        />
      )}
      {selectedMemory && deleteConfirmVisible && (
        <MemoryDeleteConfirmSheet
          busy={busy}
          onConfirm={() => void runTask(deleteSelectedMemory)}
          onCancel={() => setDeleteConfirmVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  homeRoot: { flex: 1, backgroundColor: '#e3e8e5' },
  root: { flex: 1, backgroundColor: '#f3f0e8' },
  page: { padding: 18, paddingTop: 56, paddingBottom: 64, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, color: '#58634c', fontWeight: '700' },
  heading: { marginTop: 4, fontSize: 28, fontWeight: '800', color: '#1d251a' },
  state: { backgroundColor: '#dce6ce', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, color: '#314126', fontWeight: '700' },
  statusBox: { backgroundColor: '#fff8df', borderWidth: 1, borderColor: '#e5d69d', borderRadius: 12, padding: 12 },
  statusText: { color: '#534a2c', lineHeight: 20 },
  section: { backgroundColor: '#ffffff', borderRadius: 14, padding: 15, gap: 10, borderWidth: 1, borderColor: '#ddd9ce' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#20271e' },
  hint: { color: '#6b7066', lineHeight: 20 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#c8c8be', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fafaf7', color: '#171a16' },
  bodyInput: { minHeight: 100, textAlignVertical: 'top' },
  spacer: { height: 2 },
  centerText: { textAlign: 'center', padding: 24 },
  memoryCard: { backgroundColor: '#f6f7f2', borderRadius: 10, padding: 12, gap: 6 },
  memoryCardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  memoryTitle: { fontSize: 16, fontWeight: '700', color: '#1e241b' },
  memoryBody: { color: '#3f473b', lineHeight: 20 },
  memoryMeta: { color: '#818779', fontSize: 12 },
  readLink: { marginTop: 4, color: '#58634c', fontSize: 13, fontWeight: '700' },
  readerCard: { gap: 12, paddingVertical: 4 },
  readerDate: { color: '#7c7464', fontSize: 12, letterSpacing: 0.8 },
  readerTitle: { color: '#1d251a', fontSize: 27, lineHeight: 34, fontWeight: '800' },
  readerLocation: { color: '#58634c', fontSize: 14 },
  readerPhoto: { width: '100%', height: 300, borderRadius: 12, backgroundColor: '#161916' },
  readerBody: { color: '#343a30', fontSize: 17, lineHeight: 29 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { color: '#58634c', backgroundColor: '#edf1e7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12 },
  previewBox: { gap: 8, marginTop: 4 },
  preview: { width: '100%', height: 260, backgroundColor: '#151515', borderRadius: 10 },
  dangerSection: { paddingTop: 4 },
});
