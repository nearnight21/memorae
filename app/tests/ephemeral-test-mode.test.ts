import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  decryptMemoryV2,
  decryptPhoto,
  destroyVaultSession,
  type EncryptedMemoryV1,
  type EncryptedPhotoV1,
  type VaultEnvelopeV1,
} from '../src/crypto';
import { downloadCiphertext, type CipherSyncStorage } from '../src/sync/syncActions';
import { createEphemeralTestBootstrap } from '../src/testing/ephemeralTestRuntime';
import { nodeCryptoPrimitives } from './support/nodePrimitives';

const require = createRequire(import.meta.url);
const { patchEphemeralTestBuild } = require('../plugins/with-ephemeral-test-build.js') as {
  patchEphemeralTestBuild: (contents: string) => string;
};

function receivingStorage(envelope: VaultEnvelopeV1): {
  storage: CipherSyncStorage;
  memories: Map<string, EncryptedMemoryV1>;
  photos: Map<string, EncryptedPhotoV1>;
} {
  const memories = new Map<string, EncryptedMemoryV1>();
  const photos = new Map<string, EncryptedPhotoV1>();
  return {
    memories,
    photos,
    storage: {
      getVault: async () => envelope,
      saveVault: async () => undefined,
      listMemories: async () => [...memories.values()],
      getMemory: async (id) => memories.get(id) ?? null,
      listPhotos: async () => [...photos.values()],
      listPhotoRefs: async () => [...photos.values()].map(({ id, kind }) => ({ id, kind })),
      getPhoto: async (id, kind) => photos.get(`${id}:${kind}`) ?? null,
      saveMemory: async (memory) => { memories.set(memory.id, memory); },
      savePhoto: async (photo) => { photos.set(`${photo.id}:${photo.kind}`, photo); },
      saveCachedPhoto: async (photo) => { photos.set(`${photo.id}:${photo.kind}`, photo); },
    },
  };
}

test('临时测试模式不需要密码，并真实完成密文上传、下载与解密', async () => {
  const bootstrap = await createEphemeralTestBootstrap(nodeCryptoPrimitives);
  try {
    assert.equal(bootstrap.uploadedMemories, 5);
    assert.equal(bootstrap.uploadedPhotos, 15);

    const remoteMemories = await bootstrap.client.listMemories();
    const serializedCiphertext = JSON.stringify(remoteMemories);
    assert.equal(remoteMemories.length, 5);
    assert.doesNotMatch(serializedCiphertext, /宁波 · 今年|用于验证浙江省/);

    const destination = receivingStorage(bootstrap.envelope);
    const downloaded = await downloadCiphertext({
      client: bootstrap.client,
      storage: destination.storage,
      decryptMemory: async (memory) => (
        await decryptMemoryV2(nodeCryptoPrimitives, bootstrap.session, memory)
      ).memory,
    });
    assert.equal(downloaded.memories, 5);
    assert.equal(downloaded.photos, 5);

    const restored = await Promise.all([...destination.memories.values()].map(async (memory) => (
      await decryptMemoryV2(nodeCryptoPrimitives, bootstrap.session, memory)
    ).memory));
    assert.ok(restored.some((memory) => memory.title === '宁波 · 今年'));
    assert.ok(restored.some((memory) => memory.title === '上海 · 省级单条'));

    const thumbnail = [...destination.photos.values()][0];
    assert.ok(thumbnail);
    const decryptedPhoto = await decryptPhoto(nodeCryptoPrimitives, bootstrap.session, thumbnail);
    assert.equal(decryptedPhoto.metadata.mimeType, 'image/png');
    assert.ok(decryptedPhoto.bytes.byteLength > 0);
    decryptedPhoto.bytes.fill(0);
  } finally {
    destroyVaultSession(bootstrap.session);
  }
});

test('临时测试 APK 使用独立入口，普通入口不引用测试代码', async () => {
  const [ordinaryEntry, testEntry, runtime] = await Promise.all([
    readFile(new URL('../index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../index.e2e.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/testing/ephemeralTestRuntime.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(ordinaryEntry, /ephemeralTestRuntime|index\.e2e/);
  assert.match(testEntry, /createEphemeralTestBootstrap/);
  assert.doesNotMatch(runtime, /createVault|unlockVault|私密空间密码/);
});

test('临时测试构建插件可重复执行且只添加一次构建入口', () => {
  const fixture = `def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

react {
    entryFile = file(["node", "-e", "require('expo/scripts/resolveAppEntry')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())
}

android {
    buildTypes {
        debug {}
        release {}
    }
}
`;
  const patched = patchEphemeralTestBuild(fixture);
  assert.match(patched, /memoryRecallEphemeralTestRequested/);
  assert.match(patched, /index\.e2e\.tsx/);
  assert.match(patched, /applicationIdSuffix "\.test"/);
  assert.equal(patchEphemeralTestBuild(patched), patched);
});
