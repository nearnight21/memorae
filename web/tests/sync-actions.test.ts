import assert from 'node:assert/strict';
import test from 'node:test';
import type { EncryptedMemoryV1, VaultEnvelopeV1 } from '../src/crypto';
import { downloadCiphertext, type CipherSyncStorage } from '../src/sync/syncActions';
import type { MemoryRecallSyncClient } from '../src/sync/syncClient';

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
  });
});
