import assert from 'node:assert/strict';
import test from 'node:test';
import {
  downloadCiphertext,
  mergeUploadPlans,
  uploadCiphertext,
} from '../src/sync/syncActions';
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

test('恢复同步只下载缩略图，不等待 preview/original', async () => {
  const requestedKinds: string[] = [];
  const storedKinds: string[] = [];
  const client = {
    getVault: async () => vault,
    listMemories: async () => [memory],
    getPhotoVariant: async (_id: string, kind: string) => {
      requestedKinds.push(kind);
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
  assert.deepEqual(requestedKinds, ['thumbnail']);
  assert.deepEqual(storedKinds, ['thumbnail']);
  await sync;
});

test('远端记忆版本更新但本地已有缩略图时跳过 COS 下载', async () => {
  let downloadCalls = 0;
  const localMemory = { ...memory, version: 1 };
  const remoteMemory = { ...memory, version: 2 };
  const client = {
    getVault: async () => vault,
    listMemories: async () => [remoteMemory],
    getPhotoVariant: async () => { downloadCalls += 1; throw new Error('不应下载已缓存缩略图'); },
  };
  const storage = {
    getVault: async () => vault,
    saveVault: async () => undefined,
    listMemories: async () => [localMemory],
    listPhotos: async () => [],
    getPhoto: async () => ({ id: 'photo-1', kind: 'thumbnail', cryptoVersion: 1, metadata: {}, content: {} }),
    saveMemory: async () => undefined,
    savePhoto: async () => undefined,
  };

  const result = await downloadCiphertext({
    client: client as never,
    storage: storage as never,
    decryptMemory: async () => ({ photos: [{ id: 'photo-1' }] }),
  });

  assert.equal(downloadCalls, 0);
  assert.equal(result.photos, 0);
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
  const metrics: Array<{ operation: string; kind?: string; bytes?: number; durationsMs: Record<string, number> }> = [];
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

  const result = await uploadCiphertext(client as never, storage as never, {
    onPhotoPerformance: (metric) => metrics.push(metric),
  });

  assert.deepEqual(calls, ['read:photo-lazy:original', 'upload-photo']);
  assert.equal(result.photos, 1);
  assert.deepEqual(metrics.map(({ operation, kind }) => ({ operation, kind })), [{ operation: 'upload', kind: 'original' }]);
  assert.ok(metrics[0].bytes !== undefined && metrics[0].bytes > 0);
  assert.deepEqual(Object.keys(metrics[0].durationsMs).sort(), ['storage-read', 'total', 'transfer']);
});

test('增量上传只读取计划中的记忆和照片，不扫描整个照片库', async () => {
  const uploadedMemories: string[] = [];
  const uploadedPhotos: string[] = [];
  const selectedPhoto: { id: string; kind: 'thumbnail'; cryptoVersion: 1; metadata: never; content: never } = {
    id: 'photo-new', kind: 'thumbnail', cryptoVersion: 1, metadata: {} as never, content: {} as never,
  };
  const client = {
    getVault: async () => vault,
    putVault: async () => undefined,
    putMemory: async (item: { id: string }) => { uploadedMemories.push(item.id); },
    putPhotoVariant: async (photo: { id: string; kind: string }) => { uploadedPhotos.push(`${photo.id}:${photo.kind}`); },
  };
  const storage = {
    getVault: async () => vault,
    listMemories: async () => [memory, { ...memory, id: 'memory-other' }],
    listPhotos: async () => { throw new Error('增量上传不应扫描全部照片'); },
    listPhotoRefs: async () => { throw new Error('增量上传不应扫描照片引用'); },
    getPhoto: async (id: string, kind: string) => id === selectedPhoto.id && kind === selectedPhoto.kind ? selectedPhoto : null,
  };

  await uploadCiphertext(client as never, storage as never, {
    plan: { memoryIds: [memory.id], photoRefs: [{ id: selectedPhoto.id, kind: selectedPhoto.kind }] },
  });

  assert.deepEqual(uploadedMemories, [memory.id]);
  assert.deepEqual(uploadedPhotos, ['photo-new:thumbnail']);
});

test('上传计划合并并去重记忆和照片档位', () => {
  assert.deepEqual(
    mergeUploadPlans(
      { memoryIds: ['memory-1'], photoRefs: [{ id: 'photo-1', kind: 'thumbnail' }] },
      { memoryIds: ['memory-1', 'memory-2'], photoRefs: [
        { id: 'photo-1', kind: 'thumbnail' },
        { id: 'photo-1', kind: 'original' },
      ] },
    ),
    {
      memoryIds: ['memory-1', 'memory-2'],
      photoRefs: [
        { id: 'photo-1', kind: 'thumbnail' },
        { id: 'photo-1', kind: 'original' },
      ],
    },
  );
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
