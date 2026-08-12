import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  base64ToBytes,
  bytesToHex,
  createVault,
  decryptMemory,
  decryptMemoryV1,
  decryptMemoryV2,
  decryptPhoto,
  destroyVaultSession,
  encryptMemory,
  encryptMemoryV1,
  encryptMemoryV2,
  encryptPhoto,
  MemorySchemaError,
  readMemoryV1,
  readMemoryV2,
  unlockVault,
  VaultUnlockError,
  type EncryptedMemoryV1,
  type EncryptedPhotoV1,
  type MemoryV1,
  type MemoryV2,
  type VaultEnvelopeV1,
} from '../src/crypto';
import { nodeCryptoPrimitives } from './support/nodePrimitives';

const TEST_KDF = {
  memoryKiB: 8 * 1024,
  iterations: 2,
  parallelism: 1,
};

const sampleMemoryV1: MemoryV1 = {
  schemaVersion: 1,
  id: 'memory-v1-hangzhou-001',
  title: '雨后的西湖',
  text: '傍晚沿湖散步，树叶和石板路都很亮。',
  date: '2026-08-09',
  tags: ['杭州', '散步'],
  location: {
    name: '西湖边',
    city: '杭州',
    country: '中国',
    lat: 30.246,
    lng: 120.15,
  },
  photos: [{ id: 'photo-v1-hangzhou-001', mimeType: 'image/png' }],
  createdAt: '2026-08-09T10:20:30.000Z',
  updatedAt: '2026-08-09T10:20:30.000Z',
};

const sampleMemoryV2: MemoryV2 = {
  schemaVersion: 2,
  id: 'memory-v2-hangzhou-001',
  title: '雨后的西湖',
  date: '2026-08-12',
  category: 'travel',
  tag: '杭州 · 散步',
  pastSelf: '傍晚沿湖散步，树叶和石板路都很亮。',
  presentSelf: '现在仍然记得雨后的气味。',
  pinnedBy: 'tape',
  board: { px: 18, py: 24, rotation: -3 },
  location: { name: '西湖边', city: '杭州', country: '中国', lat: 30.246, lng: 120.15, mx: 42, my: 55, detail: '苏堤南口' },
  photos: [{ id: 'photo-v2-hangzhou-001', mimeType: 'image/jpeg' }],
  createdAt: '2026-08-12T10:20:30.000Z',
  updatedAt: '2026-08-12T10:20:30.000Z',
};

const WEB_MEMORY_V1_FIXTURE_PASSWORD = 'memory-v1-cross-client-password';
const WEB_MEMORY_V1_FIXTURE_PHOTO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const webMemoryV1FixtureExpected: MemoryV1 = {
  schemaVersion: 1,
  id: 'web-memory-v1-001',
  title: '网页端的西湖记忆',
  text: '这段文字由 Web 加密，必须能在 Android 恢复。',
  date: '2026-08-10',
  tags: ['杭州', '双端兼容'],
  location: {
    name: '西湖断桥',
    city: '杭州',
    country: '中国',
    lat: 30.259,
    lng: 120.148,
  },
  photos: [{ id: 'web-photo-v1-001', mimeType: 'image/png' }],
  createdAt: '2026-08-10T04:00:00.000Z',
  updatedAt: '2026-08-10T04:00:00.000Z',
};
const webMemoryV1FixturePhotoMetadata = {
  filename: 'web-west-lake.png',
  mimeType: 'image/png',
  byteLength: 68,
};

interface WebFixture {
  password: string;
  bundle: {
    vault: VaultEnvelopeV1;
    memories: EncryptedMemoryV1[];
    photos: EncryptedPhotoV1[];
  };
  expected: {
    memory: Record<string, unknown>;
    photoBytesBase64: string;
  };
}

interface MemoryV1Fixture {
  vault: VaultEnvelopeV1;
  memories: EncryptedMemoryV1[];
  photos: EncryptedPhotoV1[];
}

async function loadWebFixture(): Promise<WebFixture> {
  const value = await readFile(
    new URL('./fixtures/web-v1-bundle.json', import.meta.url),
    'utf8',
  );
  return JSON.parse(value) as WebFixture;
}

async function loadWebMemoryV1Fixture(): Promise<MemoryV1Fixture> {
  const value = await readFile(
    new URL('./fixtures/web-memory-v1-bundle.json', import.meta.url),
    'utf8',
  );
  return JSON.parse(value) as MemoryV1Fixture;
}

test('Argon2id 固定向量与网页实现一致', async () => {
  const derived = await nodeCryptoPrimitives.argon2id({
    password: new TextEncoder().encode('ABCD2345'),
    salt: new Uint8Array(16).fill(7),
    memoryKiB: 65536,
    iterations: 3,
    parallelism: 1,
    hashLength: 32,
  });

  assert.equal(
    bytesToHex(derived),
    '7d0e2bc7e36bfc948fe53381065a22857b5a4612ef6770ce16719e8f04f8b53d',
  );
});

test('AES-256-GCM 固定向量锁定网页与移动端的密文格式', async () => {
  const encrypted = await nodeCryptoPrimitives.aesGcmEncrypt({
    key: Uint8Array.from({ length: 32 }, (_, index) => index),
    iv: Uint8Array.from({ length: 12 }, (_, index) => index + 32),
    aad: new TextEncoder().encode('memory-recall:native-web-vector'),
    plaintext: new TextEncoder().encode('Android encrypts, web decrypts.'),
  });
  assert.equal(
    bytesToHex(encrypted),
    '9354c20203f17e2e7f1221bcb868808afc699bf9e5a0078b0f8415623df970c559d9e3785b1daaf9346b4012f9a9c5',
  );
});

test('移动端核心可以解开网页端生成的 VMK、文字和照片', async () => {
  const fixture = await loadWebFixture();
  const session = await unlockVault(
    nodeCryptoPrimitives,
    fixture.bundle.vault,
    fixture.password,
  );

  const memory = await decryptMemory<Record<string, unknown>>(
    nodeCryptoPrimitives,
    session,
    fixture.bundle.memories[0],
  );
  const photo = await decryptPhoto(
    nodeCryptoPrimitives,
    session,
    fixture.bundle.photos[0],
  );

  assert.deepEqual(memory, fixture.expected.memory);
  assert.deepEqual(photo.bytes, base64ToBytes(fixture.expected.photoBytesBase64));
  assert.equal(photo.metadata.filename, 'compat.jpg');
});

test('创建、加密、锁定和重新解锁形成闭环', async () => {
  const password = 'correct horse battery staple';
  const memory = {
    id: 'mobile-memory-001',
    title: '安卓原型',
    body: '只验证加密闭环。',
  };
  const photoBytes = new Uint8Array([1, 2, 3, 4, 5]);
  const { envelope, session } = await createVault(
    nodeCryptoPrimitives,
    password,
    TEST_KDF,
  );
  const encryptedMemory = await encryptMemory(
    nodeCryptoPrimitives,
    session,
    memory,
  );
  const encryptedPhoto = await encryptPhoto(
    nodeCryptoPrimitives,
    session,
    photoBytes,
    { filename: 'test.jpg', mimeType: 'image/jpeg' },
  );

  destroyVaultSession(session);
  assert.deepEqual(session.vmk, new Uint8Array(32));

  const restoredSession = await unlockVault(
    nodeCryptoPrimitives,
    envelope,
    password,
  );
  assert.deepEqual(
    await decryptMemory(nodeCryptoPrimitives, restoredSession, encryptedMemory),
    memory,
  );
  assert.deepEqual(
    (await decryptPhoto(nodeCryptoPrimitives, restoredSession, encryptedPhoto)).bytes,
    photoBytes,
  );
});

test('Android 可以逐字段恢复 Web 生成的固定 MemoryV1 密文夹具', async () => {
  const fixture = await loadWebMemoryV1Fixture();
  const session = await unlockVault(
    nodeCryptoPrimitives,
    fixture.vault,
    WEB_MEMORY_V1_FIXTURE_PASSWORD,
  );
  const memory = await decryptMemoryV1(
    nodeCryptoPrimitives,
    session,
    fixture.memories[0],
  );
  const photo = await decryptPhoto(
    nodeCryptoPrimitives,
    session,
    fixture.photos[0],
  );

  assert.deepEqual(memory.memory, webMemoryV1FixtureExpected);
  assert.deepEqual(photo.bytes, base64ToBytes(WEB_MEMORY_V1_FIXTURE_PHOTO_BASE64));
  assert.deepEqual(photo.metadata, webMemoryV1FixturePhotoMetadata);

  const exportedCiphertext = JSON.stringify(fixture);
  for (const plaintext of [
    webMemoryV1FixtureExpected.title,
    webMemoryV1FixtureExpected.text,
    webMemoryV1FixtureExpected.location?.name ?? '',
    webMemoryV1FixturePhotoMetadata.filename,
    WEB_MEMORY_V1_FIXTURE_PHOTO_BASE64,
  ]) {
    assert.equal(exportedCiphertext.includes(plaintext), false);
  }
});

test('preview 照片使用独立 AAD，不能被伪装成其他档位', async () => {
  const { session } = await createVault(
    nodeCryptoPrimitives,
    'preview-photo-password',
    TEST_KDF,
  );
  const bytes = new Uint8Array([10, 20, 30, 40]);
  const encrypted = await encryptPhoto(
    nodeCryptoPrimitives,
    session,
    bytes,
    { filename: 'private-preview.jpg', mimeType: 'image/jpeg' },
    { id: 'preview-photo-001', kind: 'preview' },
  );
  assert.deepEqual(
    (await decryptPhoto(nodeCryptoPrimitives, session, encrypted)).bytes,
    bytes,
  );
  await assert.rejects(
    decryptPhoto(nodeCryptoPrimitives, session, { ...encrypted, kind: 'thumbnail' }),
  );
});

test('MemoryV1 加密后可以逐字段恢复', async () => {
  const { session } = await createVault(
    nodeCryptoPrimitives,
    'memory-v1-password',
    TEST_KDF,
  );
  const encrypted = await encryptMemoryV1(
    nodeCryptoPrimitives,
    session,
    sampleMemoryV1,
  );
  const restored = await decryptMemoryV1(
    nodeCryptoPrimitives,
    session,
    encrypted,
  );

  assert.equal(restored.migrated, false);
  assert.deepEqual(restored.memory, sampleMemoryV1);
});

test('Android 可以无损恢复正式界面的 MemoryV2 密文', async () => {
  const { session } = await createVault(
    nodeCryptoPrimitives,
    'memory-v2-password',
    TEST_KDF,
  );
  const encrypted = await encryptMemoryV2(nodeCryptoPrimitives, session, sampleMemoryV2);
  const restored = await decryptMemoryV2(nodeCryptoPrimitives, session, encrypted);

  assert.equal(restored.migrated, false);
  assert.deepEqual(restored.memory, sampleMemoryV2);
  assert.equal(JSON.stringify(encrypted).includes(sampleMemoryV2.pastSelf), false);
});

test('Android 会把 MemoryV1 补齐并迁移成 MemoryV2', () => {
  const result = readMemoryV2(sampleMemoryV1);

  assert.equal(result.migrated, true);
  assert.equal(result.memory.schemaVersion, 2);
  assert.equal(result.memory.pastSelf, sampleMemoryV1.text);
  assert.deepEqual(result.memory.photos, sampleMemoryV1.photos);
});

test('旧原型结构会迁移到 MemoryV1', () => {
  const result = readMemoryV1({
    id: 'legacy-memory-001',
    title: '旧记忆',
    body: '旧正文',
    date: '2026-08-08',
    tags: ['旧标签'],
    location: '杭州',
    photoId: 'legacy-photo-001',
    createdAt: '2026-08-08T01:02:03.000Z',
  });

  assert.equal(result.migrated, true);
  assert.equal(result.memory.schemaVersion, 1);
  assert.equal(result.memory.text, '旧正文');
  assert.deepEqual(result.memory.location, { name: '杭州' });
  assert.deepEqual(result.memory.photos, [{
    id: 'legacy-photo-001',
    mimeType: 'application/octet-stream',
  }]);
});

test('未知 Memory schemaVersion 会明确失败', () => {
  assert.throws(
    () => readMemoryV1({ ...sampleMemoryV1, schemaVersion: 2 }),
    MemorySchemaError,
  );
});

test('Android 与 Web 可以双向恢复同一份 MemoryV1 和照片字节', async () => {
  const webCryptoModulePath = '../../memory-recall-web/src/crypto/index.ts';
  const {
    createVault: createWebVault,
    decryptMemoryV1: decryptWebMemoryV1,
    decryptPhoto: decryptWebPhoto,
    encryptMemoryV1: encryptWebMemoryV1,
    encryptPhoto: encryptWebPhoto,
    unlockVault: unlockWebVault,
  } = await import(webCryptoModulePath);
  const password = 'memory-v1-cross-client-password';
  const photoBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const photoMetadata = { filename: '西湖照片.png', mimeType: 'image/png' };

  const webVault = await createWebVault(password, TEST_KDF);
  const webMemory = await encryptWebMemoryV1(webVault.session, sampleMemoryV1);
  const webPhoto = await encryptWebPhoto(
    webVault.session,
    photoBytes,
    photoMetadata,
    { id: sampleMemoryV1.photos[0].id },
  );
  const androidSession = await unlockVault(
    nodeCryptoPrimitives,
    webVault.envelope,
    password,
  );
  assert.deepEqual(
    (await decryptMemoryV1(nodeCryptoPrimitives, androidSession, webMemory)).memory,
    sampleMemoryV1,
  );
  const androidPhoto = await decryptPhoto(
    nodeCryptoPrimitives,
    androidSession,
    webPhoto,
  );
  assert.deepEqual(androidPhoto.bytes, photoBytes);
  assert.deepEqual(androidPhoto.metadata, { ...photoMetadata, byteLength: photoBytes.byteLength });

  const androidVault = await createVault(
    nodeCryptoPrimitives,
    password,
    TEST_KDF,
  );
  const androidMemory = await encryptMemoryV1(
    nodeCryptoPrimitives,
    androidVault.session,
    sampleMemoryV1,
  );
  const androidEncryptedPhoto = await encryptPhoto(
    nodeCryptoPrimitives,
    androidVault.session,
    photoBytes,
    photoMetadata,
    { id: sampleMemoryV1.photos[0].id },
  );
  const webSession = await unlockWebVault(androidVault.envelope, password);
  assert.deepEqual(
    (await decryptWebMemoryV1(webSession, androidMemory)).memory,
    sampleMemoryV1,
  );
  const webPhotoResult = await decryptWebPhoto(webSession, androidEncryptedPhoto);
  assert.deepEqual(webPhotoResult.bytes, photoBytes);
  assert.deepEqual(webPhotoResult.metadata, { ...photoMetadata, byteLength: photoBytes.byteLength });

  for (const privatePlaintext of [
    sampleMemoryV1.title,
    sampleMemoryV1.text,
    sampleMemoryV1.location?.name ?? '',
    photoMetadata.filename,
  ]) {
    assert.equal(JSON.stringify({
      vault: webVault.envelope,
      memories: [webMemory],
      photos: [webPhoto],
    }).includes(privatePlaintext), false);
    assert.equal(JSON.stringify({
      vault: androidVault.envelope,
      memories: [androidMemory],
      photos: [androidEncryptedPhoto],
    }).includes(privatePlaintext), false);
  }
});

test('错误密码不能解开 VMK', async () => {
  const { envelope } = await createVault(
    nodeCryptoPrimitives,
    'right password',
    TEST_KDF,
  );
  await assert.rejects(
    unlockVault(nodeCryptoPrimitives, envelope, 'wrong password'),
    VaultUnlockError,
  );
});

test('重复加密同一内容会得到不同 IV 和密文', async () => {
  const { session } = await createVault(
    nodeCryptoPrimitives,
    'password',
    TEST_KDF,
  );
  const memory = { id: 'repeat-001', body: 'same plaintext' };
  const first = await encryptMemory(nodeCryptoPrimitives, session, memory);
  const second = await encryptMemory(nodeCryptoPrimitives, session, memory);

  assert.notEqual(first.payload.iv, second.payload.iv);
  assert.notEqual(first.payload.ciphertext, second.payload.ciphertext);
});
