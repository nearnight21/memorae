import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadCiphertext } from '../src/sync/syncActions';

const vault = { schema: 'memory-recall-v1', cryptoVersion: 1 } as never;
const memory = {
  id: 'memory-1',
  version: 1,
  cryptoVersion: 1,
  deleted: false,
  payload: { algorithm: 'AES-256-GCM', iv: 'AA==', ciphertext: 'AA==' },
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
