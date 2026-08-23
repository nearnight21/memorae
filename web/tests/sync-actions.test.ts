import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  EncryptedMemoryV1,
  EncryptedPhotoV1,
  PhotoKind,
  VaultEnvelopeV1,
} from '../src/crypto';
import {
  downloadCiphertext,
  downloadPhotoVariant,
  uploadCiphertext,
  type CipherSyncStorage,
} from '../src/sync/syncActions';
import { SyncRequestError, type MemoryRecallSyncClient } from '../src/sync/syncClient';

const sealed = {
  algorithm: 'AES-256-GCM' as const,
  iv: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==',
};

const vault = {
  schema: 'memory-recall-vault' as const,
  cryptoVersion: 1 as const,
  createdAt: '2026-08-12T12:00:00.000Z',
  kdf: {
    name: 'Argon2id' as const,
    salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    iterations: 3,
    memoryKiB: 65_536,
    parallelism: 1,
    hashLength: 32 as const,
  },
  wrappedVmk: sealed,
  wrappedKeys: { text: sealed, photo: sealed },
};

const memory: EncryptedMemoryV1 = {
  id: 'memory-001',
  version: 1,
  cryptoVersion: 1,
  deleted: false,
  payload: sealed,
};

const photo = (kind: PhotoKind, id = 'photo-001'): EncryptedPhotoV1 => ({
  id,
  kind,
  cryptoVersion: 1,
  metadata: sealed,
  content: sealed,
});

test('本机与服务器相同版本相同密文时不会重复下载照片', async () => {
  let decryptCalls = 0;
  let savedMemories = 0;
  const storage: CipherSyncStorage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [memory],
    listPhotos: async () => [],
    saveMemory: async () => { savedMemories += 1; },
    savePhoto: async () => undefined,
  };
  const client = {
    getVault: async (): Promise<VaultEnvelopeV1> => vault,
    listMemories: async (): Promise<EncryptedMemoryV1[]> => [memory],
  } as MemoryRecallSyncClient;

  const result = await downloadCiphertext({
    client,
    storage,
    decryptMemory: async () => {
      decryptCalls += 1;
      return { photos: [{ id: 'photo-that-must-not-download' }] };
    },
  });

  assert.equal(decryptCalls, 0);
  assert.equal(savedMemories, 0);
  assert.deepEqual(result, {
    memories: 1,
    photos: 0,
    requiresUnlock: false,
    importedVault: false,
    conflictIds: [],
  });
});

test('同版本分叉只跳过冲突记录，其他远端记忆仍可恢复', async () => {
  const conflicting = { ...memory, id: 'memory-conflict', payload: { ...sealed, ciphertext: 'different' } };
  const saved: string[] = [];
  const storage: CipherSyncStorage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [conflicting],
    listPhotos: async () => [],
    saveMemory: async (item) => { saved.push(item.id); },
    savePhoto: async () => undefined,
  };
  const client = {
    getVault: async (): Promise<VaultEnvelopeV1> => vault,
    listMemories: async (): Promise<EncryptedMemoryV1[]> => [
      { ...memory, id: 'memory-conflict' },
      { ...memory, id: 'memory-ok' },
    ],
  } as MemoryRecallSyncClient;

  const result = await downloadCiphertext({
    client,
    storage,
    decryptMemory: async () => ({ photos: [] }),
  });

  assert.deepEqual(saved, ['memory-ok']);
  assert.deepEqual(result.conflictIds, ['memory-conflict']);
});

test('单条记忆解密失败时仍保存其他远端记忆', async () => {
  const saved: string[] = [];
  const broken = { ...memory, id: 'memory-broken' };
  const valid = { ...memory, id: 'memory-valid' };
  const storage: CipherSyncStorage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [],
    listPhotos: async () => [],
    saveMemory: async (item) => { saved.push(item.id); },
    savePhoto: async () => undefined,
  };
  const client = {
    getVault: async (): Promise<VaultEnvelopeV1> => vault,
    listMemories: async (): Promise<EncryptedMemoryV1[]> => [broken, valid],
  } as MemoryRecallSyncClient;

  const result = await downloadCiphertext({
    client,
    storage,
    decryptMemory: async (item) => {
      if (item.id === broken.id) throw new Error('incompatible memory');
      return { photos: [] };
    },
  });

  assert.deepEqual(saved, ['memory-broken', 'memory-valid']);
  assert.equal(result.memories, 2);
});

test('上传时 HTTP 409 只记录冲突，不阻断其他记录', async () => {
  const uploaded: string[] = [];
  const client = {
    getVault: async (): Promise<VaultEnvelopeV1> => vault,
    putVault: async () => undefined,
    putPhotoVariant: async () => undefined,
    putMemory: async (item: EncryptedMemoryV1) => {
      if (item.id === 'memory-conflict') throw new SyncRequestError(409, 'conflict');
      uploaded.push(item.id);
    },
  } as unknown as MemoryRecallSyncClient;
  const storage: CipherSyncStorage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [
      { ...memory, id: 'memory-conflict' },
      { ...memory, id: 'memory-ok' },
    ],
    listPhotos: async () => [],
    saveMemory: async () => undefined,
    savePhoto: async () => undefined,
  };

  const result = await (await import('../src/sync/syncActions')).uploadCiphertext(client, storage);
  assert.deepEqual(uploaded, ['memory-ok']);
  assert.deepEqual(result.conflictIds, ['memory-conflict']);
});

test('照片上传失败时仍先上传记忆密文', async () => {
  const uploaded: string[] = [];
  const client = {
    getVault: async (): Promise<VaultEnvelopeV1> => vault,
    putVault: async () => undefined,
    putPhotoVariant: async () => { throw new SyncRequestError(500, 'photo failed'); },
    putMemory: async (item: EncryptedMemoryV1) => { uploaded.push(item.id); },
  } as unknown as MemoryRecallSyncClient;
  const storage: CipherSyncStorage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [{ ...memory, id: 'memory-before-photo' }],
    listPhotos: async () => [photo('thumbnail', 'photo-1')],
    saveMemory: async () => undefined,
    savePhoto: async () => undefined,
  };

  await assert.rejects(
    uploadCiphertext(client, storage),
    /photo failed/,
  );
  assert.deepEqual(uploaded, ['memory-before-photo']);
});

test('首次恢复只下载缩略图，不预取预览和原图', async () => {
  const photoIds = Array.from({ length: 18 }, (_, index) => `photo-${String(index + 1).padStart(3, '0')}`);
  const requestedKinds: PhotoKind[] = [];
  const cachedKinds: PhotoKind[] = [];
  const permanentlySavedKinds: PhotoKind[] = [];
  const storage: CipherSyncStorage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [],
    listPhotos: async () => [],
    saveMemory: async () => undefined,
    savePhoto: async (encryptedPhoto) => { permanentlySavedKinds.push(encryptedPhoto.kind); },
    saveCachedPhoto: async (encryptedPhoto) => { cachedKinds.push(encryptedPhoto.kind); },
  };
  const client = {
    getVault: async (): Promise<VaultEnvelopeV1> => vault,
    listMemories: async (): Promise<EncryptedMemoryV1[]> => [memory],
    getPhotoVariant: async (photoId: string, kind: PhotoKind) => {
      requestedKinds.push(kind);
      return photo(kind, photoId);
    },
    getPhoto: async () => {
      throw new Error('首次恢复不应调用旧版原图下载接口。');
    },
  } as unknown as MemoryRecallSyncClient;

  const result = await downloadCiphertext({
    client,
    storage,
    decryptMemory: async () => ({ photos: photoIds.map((id) => ({ id })) }),
  });

  assert.deepEqual(requestedKinds, Array<PhotoKind>(18).fill('thumbnail'));
  assert.deepEqual(cachedKinds, Array<PhotoKind>(18).fill('thumbnail'));
  assert.deepEqual(permanentlySavedKinds, []);
  assert.equal(result.photos, 18);
});

test('按需照片下载只请求指定档位，原图不写入默认缓存', async () => {
  const requestedKinds: PhotoKind[] = [];
  const cachedKinds: PhotoKind[] = [];
  const storage = {
    savePhoto: async (encryptedPhoto: EncryptedPhotoV1) => { cachedKinds.push(encryptedPhoto.kind); },
    saveCachedPhoto: async (encryptedPhoto: EncryptedPhotoV1) => { cachedKinds.push(encryptedPhoto.kind); },
  } as CipherSyncStorage;
  const client = {
    getPhotoVariant: async (_photoId: string, kind: PhotoKind) => {
      requestedKinds.push(kind);
      return photo(kind);
    },
  } as unknown as MemoryRecallSyncClient;

  await downloadPhotoVariant(client, storage, 'photo-001', 'preview');
  await downloadPhotoVariant(client, storage, 'photo-001', 'original');

  assert.deepEqual(requestedKinds, ['preview', 'original']);
  assert.deepEqual(cachedKinds, ['preview']);
});
