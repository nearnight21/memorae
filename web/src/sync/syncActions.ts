import type {
  EncryptedMemoryV1,
  EncryptedPhotoV1,
  MemoryV1,
  VaultEnvelopeV1,
} from '../crypto';
import { MemoryRecallSyncClient, SyncRequestError } from './syncClient';

export interface CipherSyncStorage {
  getVault(): Promise<VaultEnvelopeV1 | null>;
  saveVault(vault: VaultEnvelopeV1): Promise<void>;
  listMemories(): Promise<EncryptedMemoryV1[]>;
  listPhotos(): Promise<EncryptedPhotoV1[]>;
  saveMemory(memory: EncryptedMemoryV1): Promise<void>;
  savePhoto(photo: EncryptedPhotoV1): Promise<void>;
}

export interface DownloadCiphertextOptions {
  client: MemoryRecallSyncClient;
  storage: CipherSyncStorage;
  decryptMemory?: (memory: EncryptedMemoryV1) => Promise<MemoryV1>;
}

export interface CipherSyncResult {
  memories: number;
  photos: number;
  requiresUnlock: boolean;
  importedVault: boolean;
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
  for (const photo of photos) await client.putPhoto(photo);
  for (const memory of memories) await client.putMemory(memory);

  return {
    memories: memories.length,
    photos: photos.length,
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
    throw new Error('服务器与本机不是同一个私密空间，已停止下载。');
  }
  if (!options.decryptMemory) {
    return { memories: 0, photos: 0, requiresUnlock: true, importedVault: false };
  }

  const memories = await options.client.listMemories();
  const photoIds = new Set<string>();
  for (const encryptedMemory of memories) {
    const memory = await options.decryptMemory(encryptedMemory);
    for (const photo of memory.photos) photoIds.add(photo.id);
  }

  for (const photoId of photoIds) {
    await options.storage.savePhoto(await options.client.getPhoto(photoId));
  }
  for (const memory of memories) await options.storage.saveMemory(memory);

  return {
    memories: memories.length,
    photos: photoIds.size,
    requiresUnlock: false,
    importedVault: false,
  };
}
