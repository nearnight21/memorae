import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadCiphertext, uploadCiphertext } from '../src/sync/syncActions';
import { SyncRequestError } from '../src/sync/syncClient';

const vault = { schema: 'memory-recall-v1', cryptoVersion: 1 } as never;
const memory = {
  id: 'memory-1',
  version: 1,
  cryptoVersion: 1,
  deleted: false,
  payload: { algorithm: 'AES-256-GCM', iv: 'AA==', ciphertext: 'AA==' },
};

const conflictingMemory = {
  ...memory,
  id: 'memory-conflict',
  payload: { algorithm: 'AES-256-GCM', iv: 'AA==', ciphertext: 'different==' },
} as never;

const remoteConflict = {
  ...memory,
  id: 'memory-conflict',
} as never;

test('记忆密文落盘后先通知读取方，再等待照片缓存', async () => {
  let releasePhoto: (() => void) | undefined;
  const photoGate = new Promise<void>((resolve) => { releasePhoto = resolve; });
  let storedCount = -1;
  let savedMemory = false;
  const client = {
    getVault: async () => vault,
    listMemories: async () => [memory],
    getPhotoVariant: async () => {
      await photoGate;
      return { id: 'photo-1', kind: 'thumbnail', cryptoVersion: 1, metadata: {}, content: {} };
    },
  };
  const storage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [],
    listPhotos: async () => [],
    saveMemory: async () => { savedMemory = true; },
    savePhoto: async () => undefined,
  };
  let callbackResolve: (() => void) | undefined;
  const callbackReached = new Promise<void>((resolve) => { callbackResolve = resolve; });
  const sync = downloadCiphertext({
    client: client as never,
    storage: storage as never,
    decryptMemory: async () => ({ photos: [{ id: 'photo-1' }] }),
    onMemoriesStored: (count) => {
      storedCount = count;
      callbackResolve?.();
    },
  });

  await callbackReached;
  assert.equal(savedMemory, true);
  assert.equal(storedCount, 1);
  releasePhoto?.();
  await sync;
});

test('每档照片密文落盘后通知读取方，缩略图无需等待原图完成', async () => {
  let releaseOriginal: (() => void) | undefined;
  const originalGate = new Promise<void>((resolve) => { releaseOriginal = resolve; });
  const storedKinds: string[] = [];
  const client = {
    getVault: async () => vault,
    listMemories: async () => [memory],
    getPhotoVariant: async (_id: string, kind: string) => {
      if (kind === 'original') await originalGate;
      return { id: 'photo-1', kind, cryptoVersion: 1, metadata: {}, content: {} };
    },
  };
  const storage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [],
    listPhotos: async () => [],
    saveMemory: async () => undefined,
    savePhoto: async (photo: { kind: string }) => { storedKinds.push(photo.kind); },
  };
  let thumbnailStored = false;
  const sync = downloadCiphertext({
    client: client as never,
    storage: storage as never,
    decryptMemory: async () => ({ photos: [{ id: 'photo-1' }] }),
    onPhotoStored: (photo) => {
      if (photo.kind === 'thumbnail') thumbnailStored = true;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(thumbnailStored, true);
  assert.deepEqual(storedKinds, ['thumbnail', 'preview']);
  releaseOriginal?.();
  await sync;
});

test('下载时跳过同版本分叉，但继续落盘其他远端记忆', async () => {
  const saved: string[] = [];
  const client = {
    getVault: async () => vault,
    listMemories: async () => [remoteConflict, { ...memory, id: 'memory-ok' }],
  };
  const storage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [conflictingMemory],
    listPhotos: async () => [],
    saveMemory: async (item: { id: string }) => { saved.push(item.id); },
    savePhoto: async () => undefined,
  };

  const result = await downloadCiphertext({
    client: client as never,
    storage: storage as never,
    decryptMemory: async () => ({ photos: [] }),
  });

  assert.deepEqual(saved, ['memory-ok']);
  assert.equal(result.memories, 2);
  assert.deepEqual(result.conflictIds, ['memory-conflict']);
});

test('下载更高版本 tombstone 会隐藏记忆并清理不再引用的本地照片', async () => {
  const tombstone = { ...memory, version: 2, deleted: true };
  const saved: typeof tombstone[] = [];
  const deletedPhotos: string[] = [];
  const client = {
    getVault: async () => vault,
    listMemories: async () => [tombstone],
  };
  const storage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [memory],
    listPhotos: async () => [],
    saveMemory: async (item: typeof tombstone) => { saved.push(item); },
    savePhoto: async () => undefined,
    deletePhotoVariants: async (id: string) => { deletedPhotos.push(id); },
  };

  await downloadCiphertext({
    client: client as never,
    storage: storage as never,
    decryptMemory: async () => ({ photos: [{ id: 'photo-deleted' }] }),
  });

  assert.equal(saved[0]?.deleted, true);
  assert.equal(saved[0]?.version, 2);
  assert.deepEqual(deletedPhotos, ['photo-deleted']);
});

test('本地更高版本 tombstone 不会被旧的远端活动记录复活', async () => {
  const localTombstone = { ...memory, version: 3, deleted: true };
  const saved: unknown[] = [];
  const client = {
    getVault: async () => vault,
    listMemories: async () => [memory],
  };
  const storage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [localTombstone],
    listPhotos: async () => [],
    saveMemory: async (item: unknown) => { saved.push(item); },
    savePhoto: async () => undefined,
  };

  const result = await downloadCiphertext({
    client: client as never,
    storage: storage as never,
    decryptMemory: async () => ({ photos: [] }),
  });

  assert.deepEqual(saved, []);
  assert.equal(result.memories, 1);
});

test('上传本机密文时先校验同一私密空间，再上传照片和记忆并返回数量', async () => {
  const calls: string[] = [];
  const photo = { id: 'photo-1', kind: 'thumbnail', cryptoVersion: 1, metadata: {}, content: {} } as never;
  const memoryToUpload = {
    id: 'memory-upload-1',
    version: 1,
    cryptoVersion: 1,
    deleted: false,
    payload: { algorithm: 'AES-256-GCM', iv: 'AA==', ciphertext: 'AA==' },
  } as never;
  const client = {
    getVault: async () => { calls.push('getVault'); return vault; },
    putVault: async () => { calls.push('putVault'); },
    putPhotoVariant: async () => { calls.push('putPhotoVariant'); },
    putMemory: async () => { calls.push('putMemory'); },
  };
  const storage = {
    getVault: async () => vault,
    listMemories: async () => [memoryToUpload],
    listPhotos: async () => [photo],
  };

  const result = await uploadCiphertext(client as never, storage as never);

  assert.deepEqual(calls, ['getVault', 'putVault', 'putMemory', 'putPhotoVariant']);
  assert.deepEqual(result, {
    memories: 1,
    photos: 1,
    requiresUnlock: false,
    importedVault: false,
    conflictIds: [],
  });
});

test('后台上传使用照片引用逐张读取，避免一次性加载全部原图', async () => {
  const calls: string[] = [];
  const photoId = 'photo-lazy';
  const photoKind = 'original' as const;
  const photo = { id: photoId, kind: photoKind, cryptoVersion: 1, metadata: {}, content: {} } as never;
  const client = {
    getVault: async () => vault,
    putVault: async () => undefined,
    putMemory: async () => undefined,
    putPhotoVariant: async () => { calls.push('upload-photo'); },
  };
  const storage = {
    getVault: async () => vault,
    listMemories: async () => [],
    listPhotos: async () => { throw new Error('must not eagerly read photo files'); },
    listPhotoRefs: async () => [{ id: photoId, kind: photoKind }],
    getPhoto: async (id: string, kind: string) => {
      calls.push(`read:${id}:${kind}`);
      return photo;
    },
  };

  const result = await uploadCiphertext(client as never, storage as never);

  assert.deepEqual(calls, ['read:photo-lazy:original', 'upload-photo']);
  assert.equal(result.photos, 1);
});

test('上传时跳过服务器拒绝的冲突记录，但继续上传其他记忆', async () => {
  const uploaded: string[] = [];
  const client = {
    getVault: async () => vault,
    putVault: async () => undefined,
    putPhotoVariant: async () => undefined,
    putMemory: async (item: { id: string }) => {
      if (item.id === 'memory-conflict') {
        throw new SyncRequestError(409, 'conflict');
      }
      uploaded.push(item.id);
    },
  };
  const storage = {
    getVault: async () => vault,
    listMemories: async () => [conflictingMemory, { ...memory, id: 'memory-ok' }],
    listPhotos: async () => [],
  };

  const syncClient = client as never;
  const result = await uploadCiphertext(syncClient, storage as never);

  assert.deepEqual(uploaded, ['memory-ok']);
  assert.deepEqual(result.conflictIds, ['memory-conflict']);
});

test('照片上传失败时仍先上传记忆密文', async () => {
  const uploaded: string[] = [];
  const client = {
    getVault: async () => vault,
    putVault: async () => undefined,
    putPhotoVariant: async () => { throw new SyncRequestError(500, 'photo failed'); },
    putMemory: async (item: { id: string }) => { uploaded.push(item.id); },
  };
  const storage = {
    getVault: async () => vault,
    listMemories: async () => [{ ...memory, id: 'memory-before-photo' }],
    listPhotos: async () => [{ id: 'photo-1', kind: 'thumbnail' }],
  };

  await assert.rejects(
    uploadCiphertext(client as never, storage as never),
    /photo failed/,
  );
  assert.deepEqual(uploaded, ['memory-before-photo']);
});
