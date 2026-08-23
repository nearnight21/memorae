import type {
  EncryptedMemoryV1,
  EncryptedPhotoV1,
  VaultEnvelopeV1,
} from '../crypto';
import {
  DirectPhotoTransferUnavailableError,
  MemoryRecallSyncClient,
  PhotoVariantNotFoundError,
  SyncRequestError,
} from './syncClient';

export interface CipherSyncStorage {
  getVault(): Promise<VaultEnvelopeV1 | null>;
  saveVault(vault: VaultEnvelopeV1): Promise<void>;
  listMemories(): Promise<EncryptedMemoryV1[]>;
  listPhotos(): Promise<EncryptedPhotoV1[]>;
  saveMemory(memory: EncryptedMemoryV1): Promise<void>;
  savePhoto(photo: EncryptedPhotoV1): Promise<void>;
  saveCachedPhoto?(photo: EncryptedPhotoV1): Promise<void>;
}

export interface DownloadCiphertextOptions {
  client: MemoryRecallSyncClient;
  storage: CipherSyncStorage;
  decryptMemory?: (memory: EncryptedMemoryV1) => Promise<{ photos: Array<{ id: string }> }>;
  onDiagnostics?: (diagnostics: CipherSyncDiagnostics) => void;
  onMemoriesStored?: (count: number) => void | Promise<void>;
}

export interface CipherSyncDiagnostics {
  remoteEncryptedCount: number;
  acceptedEncryptedCount: number;
  storedEncryptedCount: number;
  decryptSuccessCount: number;
  decryptFailedCount: number;
  decryptErrorTypes: string[];
  withLocationCount: number;
  withValidCoordsCount: number;
  conflictIds: string[];
}

export interface CipherSyncResult {
  memories: number;
  photos: number;
  requiresUnlock: boolean;
  importedVault: boolean;
  conflictIds: string[];
}

function sameVault(left: VaultEnvelopeV1, right: VaultEnvelopeV1): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function getRemoteVaultIfPresent(
  client: MemoryRecallSyncClient,
): Promise<VaultEnvelopeV1 | null> {
  try {
    return await client.getVault();
  } catch (error) {
    if (error instanceof SyncRequestError && error.status === 404) return null;
    throw error;
  }
}

export async function uploadCiphertext(
  client: MemoryRecallSyncClient,
  storage: CipherSyncStorage,
): Promise<CipherSyncResult> {
  const localVault = await storage.getVault();
  if (!localVault) throw new Error('本机还没有可以上传的私密空间。');

  const remoteVault = await getRemoteVaultIfPresent(client);
  if (remoteVault && !sameVault(localVault, remoteVault)) {
    throw new Error('服务器属于另一个私密空间，已停止上传以免覆盖钥匙信封。');
  }

  const [memories, photos] = await Promise.all([
    storage.listMemories(),
    storage.listPhotos(),
  ]);
  await client.putVault(localVault);
  const conflictIds: string[] = [];
  for (const memory of memories) {
    try {
      await client.putMemory(memory);
    } catch (error) {
      if (error instanceof SyncRequestError && error.status === 409) {
        conflictIds.push(memory.id);
        continue;
      }
      throw error;
    }
  }
  let uploadedPhotos = 0;
  for (const photo of photos) {
    try {
      await client.putPhotoVariant(photo);
      uploadedPhotos += 1;
    } catch (error) {
      if (!(error instanceof DirectPhotoTransferUnavailableError)) throw error;
      if (photo.kind === 'original') {
        await client.putPhoto(photo);
        uploadedPhotos += 1;
      }
    }
  }
  return {
    memories: memories.length,
    photos: uploadedPhotos,
    requiresUnlock: false,
    importedVault: false,
    conflictIds,
  };
}

export async function downloadCiphertext(
  options: DownloadCiphertextOptions,
): Promise<CipherSyncResult> {
  const diagnostics: CipherSyncDiagnostics = {
    remoteEncryptedCount: 0,
    acceptedEncryptedCount: 0,
    storedEncryptedCount: 0,
    decryptSuccessCount: 0,
    decryptFailedCount: 0,
    decryptErrorTypes: [],
    withLocationCount: 0,
    withValidCoordsCount: 0,
    conflictIds: [],
  };
  const reportDiagnostics = () => options.onDiagnostics?.({
    ...diagnostics,
    decryptErrorTypes: [...diagnostics.decryptErrorTypes],
  });
  const remoteVault = await options.client.getVault();
  const localVault = await options.storage.getVault();

  if (!localVault) {
    await options.storage.saveVault(remoteVault);
    return { memories: 0, photos: 0, requiresUnlock: true, importedVault: true, conflictIds: [] };
  }
  if (!sameVault(localVault, remoteVault)) {
    throw new Error('服务器与本机不是同一个私密空间，已停止下载。');
  }
  if (!options.decryptMemory) {
    return { memories: 0, photos: 0, requiresUnlock: true, importedVault: false, conflictIds: [] };
  }

  const memories = await options.client.listMemories();
  diagnostics.remoteEncryptedCount = memories.length;
  const localMemories = new Map(
    (await options.storage.listMemories()).map((memory) => [memory.id, memory]),
  );
  const acceptedMemories = memories.filter((remoteMemory) => {
    const localMemory = localMemories.get(remoteMemory.id);
    if (!localMemory) return true;
    if (localMemory.version > remoteMemory.version) return false;
    if (
      localMemory.version === remoteMemory.version
      && JSON.stringify(localMemory) !== JSON.stringify(remoteMemory)
    ) {
      diagnostics.conflictIds.push(remoteMemory.id);
      return false;
    }
    return true;
  });
  diagnostics.acceptedEncryptedCount = acceptedMemories.length;
  const photoIds = new Set<string>();
  for (const encryptedMemory of acceptedMemories) {
    if (encryptedMemory.deleted) continue;
    let memory: { photos: Array<{ id: string }>; location?: { lat?: number; lng?: number } | null };
    try {
      memory = await options.decryptMemory(encryptedMemory);
    } catch (error) {
      diagnostics.decryptFailedCount += 1;
      const errorType = error instanceof Error && error.constructor.name ? error.constructor.name : 'UnknownError';
      if (!diagnostics.decryptErrorTypes.includes(errorType)) diagnostics.decryptErrorTypes.push(errorType);
      continue;
    }
    diagnostics.decryptSuccessCount += 1;
    if (memory.location) {
      diagnostics.withLocationCount += 1;
      if (Number.isFinite(memory.location.lat) && Number.isFinite(memory.location.lng)) {
        diagnostics.withValidCoordsCount += 1;
      }
    }
    for (const photo of memory.photos) photoIds.add(photo.id);
  }

  // Persist memory ciphertext before fetching optional photo objects. A slow or
  // missing photo must not hide an otherwise valid memory from the Home map.
  for (const memory of acceptedMemories) await options.storage.saveMemory(memory);
  diagnostics.storedEncryptedCount = acceptedMemories.length;
  reportDiagnostics();
  await options.onMemoriesStored?.(acceptedMemories.length);

  let downloadedPhotos = 0;
  for (const photoId of photoIds) {
    for (const kind of ['thumbnail', 'preview'] as const) {
      try {
        const photo = await options.client.getPhotoVariant(photoId, kind);
        await (options.storage.saveCachedPhoto ?? options.storage.savePhoto)(photo);
        downloadedPhotos += 1;
      } catch (error) {
        if (!(error instanceof PhotoVariantNotFoundError)) throw error;
      }
    }
    try {
      await options.storage.savePhoto(await options.client.getPhotoVariant(photoId, 'original'));
    } catch (error) {
      if (!(error instanceof PhotoVariantNotFoundError)) throw error;
      await options.storage.savePhoto(await options.client.getPhoto(photoId));
    }
    downloadedPhotos += 1;
  }
  return {
    memories: memories.length,
    photos: downloadedPhotos,
    requiresUnlock: false,
    importedVault: false,
    conflictIds: diagnostics.conflictIds,
  };
}
