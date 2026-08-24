import type {
  EncryptedMemoryV1,
  EncryptedPhotoV1,
  PhotoKind,
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
  getMemory?(id: string): Promise<EncryptedMemoryV1 | null>;
  listPhotos(): Promise<EncryptedPhotoV1[]>;
  getPhoto?(id: string, kind: PhotoKind): Promise<EncryptedPhotoV1 | null>;
  saveMemory(memory: EncryptedMemoryV1): Promise<void>;
  savePhoto(photo: EncryptedPhotoV1): Promise<void>;
  saveCachedPhoto?(photo: EncryptedPhotoV1): Promise<void>;
}

export interface DownloadCiphertextOptions {
  client: MemoryRecallSyncClient;
  storage: CipherSyncStorage;
  decryptMemory?: (memory: EncryptedMemoryV1) => Promise<{ photos: Array<{ id: string }> }>;
  downloadPhotos?: boolean;
}

export interface CipherSyncResult {
  memories: number;
  photos: number;
  requiresUnlock: boolean;
  importedVault: boolean;
  conflictIds: string[];
}

export interface UploadPlan {
  memoryIds: readonly string[];
  photoRefs: ReadonlyArray<Pick<EncryptedPhotoV1, 'id' | 'kind'>>;
}

export function mergeUploadPlans(left: UploadPlan, right: UploadPlan): UploadPlan {
  const memoryIds = [...new Set([...left.memoryIds, ...right.memoryIds])];
  const photoRefs = new Map<string, Pick<EncryptedPhotoV1, 'id' | 'kind'>>();
  for (const photo of [...left.photoRefs, ...right.photoRefs]) {
    photoRefs.set(`${photo.id}:${photo.kind}`, photo);
  }
  return { memoryIds, photoRefs: [...photoRefs.values()] };
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
  plan?: UploadPlan,
): Promise<CipherSyncResult> {
  const localVault = await storage.getVault();
  if (!localVault) throw new Error('本机还没有可以上传的私密空间。');

  const remoteVault = await getRemoteVaultIfPresent(client);
  if (remoteVault && !sameVault(localVault, remoteVault)) {
    throw new VaultMismatchError();
  }

  const memories = plan && storage.getMemory
    ? (await Promise.all(plan.memoryIds.map((id) => storage.getMemory!(id)))).filter(
      (memory): memory is EncryptedMemoryV1 => Boolean(memory),
    )
    : await storage.listMemories().then((allMemories) => plan
      ? allMemories.filter((memory) => plan.memoryIds.includes(memory.id))
      : allMemories);
  let photos: EncryptedPhotoV1[];
  if (!plan) {
    photos = await storage.listPhotos();
  } else if (storage.getPhoto) {
    photos = [];
    for (const photoRef of plan.photoRefs) {
      const photo = await storage.getPhoto(photoRef.id, photoRef.kind);
      if (photo) photos.push(photo);
    }
  } else {
    const allPhotos = await storage.listPhotos();
    const requested = new Set(plan.photoRefs.map((photo) => `${photo.id}:${photo.kind}`));
    photos = allPhotos.filter((photo) => requested.has(`${photo.id}:${photo.kind}`));
  }
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

export async function downloadPhotoVariant(
  client: MemoryRecallSyncClient,
  storage: CipherSyncStorage,
  photoId: string,
  kind: PhotoKind,
): Promise<EncryptedPhotoV1> {
  const photo = await client.getPhotoVariant(photoId, kind);
  if (kind !== 'original') {
    await (storage.saveCachedPhoto ?? storage.savePhoto)(photo);
  }
  return photo;
}

export async function downloadCiphertext(
  options: DownloadCiphertextOptions,
): Promise<CipherSyncResult> {
  const remoteVault = await options.client.getVault();
  const localVault = await options.storage.getVault();

  if (!localVault) {
    await options.storage.saveVault(remoteVault);
    return { memories: 0, photos: 0, requiresUnlock: true, importedVault: true, conflictIds: [] };
  }
  if (!sameVault(localVault, remoteVault)) {
    throw new VaultMismatchError();
  }
  if (!options.decryptMemory) {
    return { memories: 0, photos: 0, requiresUnlock: true, importedVault: false, conflictIds: [] };
  }

  const memories = await options.client.listMemories();
  const localMemories = new Map(
    (await options.storage.listMemories()).map((memory) => [memory.id, memory]),
  );
  const conflictIds: string[] = [];
  const acceptedMemories = memories.filter((remoteMemory) => {
    const localMemory = localMemories.get(remoteMemory.id);
    if (!localMemory) return true;
    if (localMemory.version > remoteMemory.version) return false;
    if (localMemory.version === remoteMemory.version) {
      if (JSON.stringify(localMemory) !== JSON.stringify(remoteMemory)) {
        conflictIds.push(remoteMemory.id);
        return false;
      }
      return false;
    }
    return true;
  });
  const photoIds = new Set<string>();
  if (options.decryptMemory && options.downloadPhotos !== false) {
    for (const encryptedMemory of acceptedMemories) {
      if (encryptedMemory.deleted) continue;
      try {
        const memory = await options.decryptMemory(encryptedMemory);
        for (const photo of memory.photos) photoIds.add(photo.id);
      } catch {
        // A single incompatible record must not hide other valid records.
      }
    }
  }

  // Metadata is the durable restore result. Photo thumbnails are a best-effort
  // display cache and must not block the accepted memory ciphertext from landing.
  for (const memory of acceptedMemories) await options.storage.saveMemory(memory);

  let downloadedPhotos = 0;
  for (const photoId of photoIds) {
    try {
      if (options.storage.getPhoto && await options.storage.getPhoto(photoId, 'thumbnail')) {
        continue;
      }
      await downloadPhotoVariant(options.client, options.storage, photoId, 'thumbnail');
      downloadedPhotos += 1;
    } catch (error) {
      if (!(error instanceof PhotoVariantNotFoundError)) throw error;
    }
  }

  return {
    memories: memories.length,
    photos: downloadedPhotos,
    requiresUnlock: false,
    importedVault: false,
    conflictIds,
  };
}
