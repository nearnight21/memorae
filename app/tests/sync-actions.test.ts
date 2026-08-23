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
    storage,
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
    storage,
    decryptMemory: async () => ({ photos: [] }),
  });

  assert.deepEqual(saved, ['memory-ok']);
  assert.equal(result.memories, 2);
  assert.deepEqual(result.conflictIds, ['memory-conflict']);
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
