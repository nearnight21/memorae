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
}

export interface CipherSyncResult {
  memories: number;
  photos: number;
  requiresUnlock: boolean;
  importedVault: boolean;
}

export class VaultMismatchError extends Error {
  constructor(message = '这个所忆账号与本机私密空间不一致。') {
    super(message);
    this.name = 'VaultMismatchError';
  }
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
    throw new VaultMismatchError();
  }

  const [memories, photos] = await Promise.all([
    storage.listMemories(),
    storage.listPhotos(),
  ]);
  await client.putVault(localVault);
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
  for (const memory of memories) await client.putMemory(memory);

  return {
    memories: memories.length,
    photos: uploadedPhotos,
    requiresUnlock: false,
    importedVault: false,
  };
}

export async function downloadCiphertext(
  options: DownloadCiphertextOptions,
): Promise<CipherSyncResult> {
  const remoteVault = await options.client.getVault();
  const localVault = await options.storage.getVault();

  if (!localVault) {
    await options.storage.saveVault(remoteVault);
    return { memories: 0, photos: 0, requiresUnlock: true, importedVault: true };
  }
  if (!sameVault(localVault, remoteVault)) {
    throw new VaultMismatchError();
  }
  if (!options.decryptMemory) {
    return { memories: 0, photos: 0, requiresUnlock: true, importedVault: false };
  }

  const memories = await options.client.listMemories();
  const localMemories = new Map(
    (await options.storage.listMemories()).map((memory) => [memory.id, memory]),
  );
  const acceptedMemories = memories.filter((remoteMemory) => {
    const localMemory = localMemories.get(remoteMemory.id);
    if (!localMemory) return true;
    if (localMemory.version > remoteMemory.version) return false;
    if (localMemory.version === remoteMemory.version) {
      if (JSON.stringify(localMemory) !== JSON.stringify(remoteMemory)) {
        throw new Error(`记忆 ${remoteMemory.id} 在本机和服务器存在同版本分叉，已停止下载。`);
      }
      return false;
    }
    return true;
  });
  const photoIds = new Set<string>();
  for (const encryptedMemory of acceptedMemories) {
    if (encryptedMemory.deleted) continue;
    const memory = await options.decryptMemory(encryptedMemory);
    for (const photo of memory.photos) photoIds.add(photo.id);
  }

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
  for (const memory of acceptedMemories) await options.storage.saveMemory(memory);

  return {
    memories: memories.length,
    photos: downloadedPhotos,
    requiresUnlock: false,
    importedVault: false,
  };
}
