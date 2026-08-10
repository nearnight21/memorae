import type { EncryptedMemoryV1, EncryptedPhotoV1, VaultEnvelopeV1 } from '../crypto';

const DATABASE_NAME = 'memory-recall-vmk-prototype';
const DATABASE_VERSION = 1;
const META_STORE = 'meta';
const MEMORY_STORE = 'memories';
const PHOTO_STORE = 'photos';
const VAULT_KEY = 'vault-v1';

export interface PrototypeBundleV1 {
  format: 'memory-recall-encrypted-bundle';
  bundleVersion: 1;
  exportedAt: string;
  vault: VaultEnvelopeV1;
  memories: EncryptedMemoryV1[];
  photos: EncryptedPhotoV1[];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('浏览器本地存储读取失败。'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('浏览器本地存储事务已取消。'));
    transaction.onerror = () => reject(transaction.error ?? new Error('浏览器本地存储写入失败。'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE);
      }
      if (!database.objectStoreNames.contains(MEMORY_STORE)) {
        database.createObjectStore(MEMORY_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(PHOTO_STORE)) {
        database.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开浏览器本地密文库。'));
  });
}

async function withDatabase<T>(operation: (database: IDBDatabase) => Promise<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

export async function getVaultEnvelope(): Promise<VaultEnvelopeV1 | null> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(META_STORE, 'readonly');
    const result = await requestResult(
      transaction.objectStore(META_STORE).get(VAULT_KEY) as IDBRequest<VaultEnvelopeV1 | undefined>,
    );
    return result ?? null;
  });
}

export async function saveVaultEnvelope(envelope: VaultEnvelopeV1): Promise<void> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put(envelope, VAULT_KEY);
    await transactionComplete(transaction);
  });
}

export async function listEncryptedMemories(): Promise<EncryptedMemoryV1[]> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(MEMORY_STORE, 'readonly');
    return requestResult(
      transaction.objectStore(MEMORY_STORE).getAll() as IDBRequest<EncryptedMemoryV1[]>,
    );
  });
}

export async function listEncryptedPhotos(): Promise<EncryptedPhotoV1[]> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(PHOTO_STORE, 'readonly');
    return requestResult(
      transaction.objectStore(PHOTO_STORE).getAll() as IDBRequest<EncryptedPhotoV1[]>,
    );
  });
}

export async function saveEncryptedMemory(memory: EncryptedMemoryV1): Promise<void> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(MEMORY_STORE, 'readwrite');
    transaction.objectStore(MEMORY_STORE).put(memory);
    await transactionComplete(transaction);
  });
}

export async function saveEncryptedPhoto(photo: EncryptedPhotoV1): Promise<void> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(PHOTO_STORE, 'readwrite');
    transaction.objectStore(PHOTO_STORE).put(photo);
    await transactionComplete(transaction);
  });
}

export async function deleteEncryptedMemory(memoryId: string, photoIds: string[] = []): Promise<void> {
  return withDatabase(async (database) => {
    const transaction = database.transaction([MEMORY_STORE, PHOTO_STORE], 'readwrite');
    transaction.objectStore(MEMORY_STORE).delete(memoryId);
    for (const photoId of photoIds) {
      transaction.objectStore(PHOTO_STORE).delete(photoId);
    }
    await transactionComplete(transaction);
  });
}

export function assertPrototypeBundle(value: unknown): asserts value is PrototypeBundleV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('文件不是有效的密文包。');
  }

  const bundle = value as Partial<PrototypeBundleV1>;
  if (
    bundle.format !== 'memory-recall-encrypted-bundle' ||
    bundle.bundleVersion !== 1 ||
    !bundle.vault ||
    bundle.vault.cryptoVersion !== 1 ||
    !Array.isArray(bundle.memories) ||
    !Array.isArray(bundle.photos)
  ) {
    throw new Error('密文包格式或版本不受支持。');
  }
}

export async function createEncryptedBundle(): Promise<PrototypeBundleV1> {
  const [vault, memories, photos] = await Promise.all([
    getVaultEnvelope(),
    listEncryptedMemories(),
    listEncryptedPhotos(),
  ]);

  if (!vault) {
    throw new Error('还没有可以导出的私密空间。');
  }

  return {
    format: 'memory-recall-encrypted-bundle',
    bundleVersion: 1,
    exportedAt: new Date().toISOString(),
    vault,
    memories,
    photos,
  };
}

export async function replaceWithEncryptedBundle(bundle: PrototypeBundleV1): Promise<void> {
  assertPrototypeBundle(bundle);

  return withDatabase(async (database) => {
    const transaction = database.transaction(
      [META_STORE, MEMORY_STORE, PHOTO_STORE],
      'readwrite',
    );
    const metaStore = transaction.objectStore(META_STORE);
    const memoryStore = transaction.objectStore(MEMORY_STORE);
    const photoStore = transaction.objectStore(PHOTO_STORE);

    metaStore.clear();
    memoryStore.clear();
    photoStore.clear();
    metaStore.put(bundle.vault, VAULT_KEY);
    bundle.memories.forEach((memory) => memoryStore.put(memory));
    bundle.photos.forEach((photo) => photoStore.put(photo));

    await transactionComplete(transaction);
  });
}

export async function clearPrototypeDatabase(): Promise<void> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(
      [META_STORE, MEMORY_STORE, PHOTO_STORE],
      'readwrite',
    );
    transaction.objectStore(META_STORE).clear();
    transaction.objectStore(MEMORY_STORE).clear();
    transaction.objectStore(PHOTO_STORE).clear();
    await transactionComplete(transaction);
  });
}
