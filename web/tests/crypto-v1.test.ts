import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CipherIntegrityError,
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
import { AES_GCM, CRYPTO_VERSION, FROZEN_KDF_DEFAULTS, VAULT_SCHEMA } from '../src/crypto/vault';
import { base64ToBytes } from '../src/crypto/encoding';
import { assertPrototypeBundle } from '../src/prototype/storage';
import { fitPhotoWithin } from '../src/photos/photoVariants';
import { toDisplayMemory } from '../src/memory/toDisplayMemory';

const PASSWORD = 'correct horse battery staple';

const TEST_KDF = {
  memoryKiB: 8 * 1024,
  iterations: 2,
  parallelism: 1,
};

const sampleMemory = {
  id: 'memory-hangzhou-001',
  title: '第一次沿湖散步',
  date: '2026-08-09',
  body: '傍晚下过一阵雨，树叶和石板路都很亮。',
  tags: ['杭州', '散步'],
  location: {
    country: '中国',
    city: '杭州',
    name: '西湖边',
    lat: 30.246,
    lng: 120.15,
  },
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
  location: {
    name: '西湖边',
    city: '杭州',
    country: '中国',
    lat: 30.246,
    lng: 120.15,
    mx: 42,
    my: 55,
    detail: '苏堤南口',
  },
  photos: [{ id: 'photo-v2-hangzhou-001', mimeType: 'image/jpeg' }],
  createdAt: '2026-08-12T10:20:30.000Z',
  updatedAt: '2026-08-12T10:20:30.000Z',
};

const ANDROID_MEMORY_V1_FIXTURE_PASSWORD = 'memory-v1-cross-client-password';
const ANDROID_MEMORY_V1_FIXTURE_PHOTO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const androidMemoryV1FixtureExpected: MemoryV1 = {
  schemaVersion: 1,
  id: 'android-memory-v1-001',
  title: 'Android 端的西湖记忆',
  text: '这段文字由 Android 加密，必须能在 Web 恢复。',
  date: '2026-08-10',
  tags: ['杭州', '双端兼容'],
  location: {
    name: '西湖苏堤',
    city: '杭州',
    country: '中国',
    lat: 30.242,
    lng: 120.14,
  },
  photos: [{ id: 'android-photo-v1-001', mimeType: 'image/png' }],
  createdAt: '2026-08-10T05:00:00.000Z',
  updatedAt: '2026-08-10T05:00:00.000Z',
};
const androidMemoryV1FixturePhotoMetadata = {
  filename: 'android-west-lake.png',
  mimeType: 'image/png',
  byteLength: 68,
};

interface MemoryV1Fixture {
  vault: VaultEnvelopeV1;
  memories: EncryptedMemoryV1[];
  photos: EncryptedPhotoV1[];
}

async function loadAndroidMemoryV1Fixture(): Promise<MemoryV1Fixture> {
  const value = await readFile(
    new URL('./fixtures/android-memory-v1-bundle.json', import.meta.url),
    'utf8',
  );
  return JSON.parse(value) as MemoryV1Fixture;
}

async function createTestVault() {
  return createVault(PASSWORD, TEST_KDF);
}

test('密码只解锁 VMK，导出的密钥信封不包含密码或明文', async () => {
  const { envelope, session } = await createTestVault();
  const serialized = JSON.stringify(envelope);

  assert.equal(envelope.cryptoVersion, 1);
  assert.equal(envelope.kdf.name, 'Argon2id');
  assert.equal(envelope.wrappedKeys.photo.algorithm, 'AES-256-GCM');
  assert.equal(serialized.includes(PASSWORD), false);
  assert.equal(serialized.includes(sampleMemory.title), false);
  assert.equal(session.vmk.byteLength, 32);
  assert.equal(session.textKey.byteLength, 32);
  assert.equal(session.photoKey.byteLength, 32);
});

test('换设备导入 JSON 后，可以用同一密码恢复并解密记忆', async () => {
  const firstDevice = await createTestVault();
  const encrypted = await encryptMemory(firstDevice.session, sampleMemory);
  const transferred = JSON.parse(
    JSON.stringify({ envelope: firstDevice.envelope, encrypted }),
  ) as { envelope: VaultEnvelopeV1; encrypted: EncryptedMemoryV1 };

  destroyVaultSession(firstDevice.session);

  const secondDeviceSession = await unlockVault(transferred.envelope, PASSWORD);
  const restored = await decryptMemory<typeof sampleMemory>(
    secondDeviceSession,
    transferred.encrypted,
  );

  assert.deepEqual(restored, sampleMemory);
});

test('加密协议冻结：Web/Mobile 默认 KDF 与信封版本不可漂移', async () => {
  const { envelope } = await createVault('freeze-protocol-password');
  assert.equal(CRYPTO_VERSION, 1);
  assert.equal(VAULT_SCHEMA, 'memory-recall-vault');
  assert.equal(AES_GCM, 'AES-256-GCM');
  assert.deepEqual(
    {
      memoryKiB: envelope.kdf.memoryKiB,
      iterations: envelope.kdf.iterations,
      parallelism: envelope.kdf.parallelism,
      hashLength: envelope.kdf.hashLength,
    },
    FROZEN_KDF_DEFAULTS,
  );
});

test('MemoryV1 加密后可以逐字段恢复', async () => {
  const { session } = await createTestVault();
  const encrypted = await encryptMemoryV1(session, sampleMemoryV1);
  const restored = await decryptMemoryV1(session, encrypted);

  assert.equal(restored.migrated, false);
  assert.deepEqual(restored.memory, sampleMemoryV1);
});

test('MemoryV2 能无损保存正式界面的版面、地点、双时态正文和照片', async () => {
  const { session } = await createTestVault();
  const encrypted = await encryptMemoryV2(session, sampleMemoryV2);
  const restored = await decryptMemoryV2(session, encrypted);

  assert.equal(restored.migrated, false);
  assert.deepEqual(restored.memory, sampleMemoryV2);
  assert.equal(JSON.stringify(encrypted).includes(sampleMemoryV2.pastSelf), false);
  assert.equal(JSON.stringify(encrypted).includes(sampleMemoryV2.location?.detail ?? ''), false);
});

test('MemoryV1 会补齐正式界面字段并迁移为 MemoryV2', () => {
  const result = readMemoryV2(sampleMemoryV1);

  assert.equal(result.migrated, true);
  assert.equal(result.memory.schemaVersion, 2);
  assert.equal(result.memory.pastSelf, sampleMemoryV1.text);
  assert.equal(result.memory.tag, '杭州 · 散步');
  assert.equal(result.memory.location?.name, '西湖边');
  assert.deepEqual(result.memory.photos, sampleMemoryV1.photos);
});

test('Web 可以逐字段恢复 Android 生成的固定 MemoryV1 密文夹具', async () => {
  const fixture = await loadAndroidMemoryV1Fixture();
  const session = await unlockVault(fixture.vault, ANDROID_MEMORY_V1_FIXTURE_PASSWORD);
  const memory = await decryptMemoryV1(session, fixture.memories[0]);
  const photo = await decryptPhoto(session, fixture.photos[0]);

  assert.deepEqual(memory.memory, androidMemoryV1FixtureExpected);
  assert.deepEqual(photo.bytes, base64ToBytes(ANDROID_MEMORY_V1_FIXTURE_PHOTO_BASE64));
  assert.deepEqual(photo.metadata, androidMemoryV1FixturePhotoMetadata);

  const exportedCiphertext = JSON.stringify(fixture);
  for (const plaintext of [
    androidMemoryV1FixtureExpected.title,
    androidMemoryV1FixtureExpected.text,
    androidMemoryV1FixtureExpected.location?.name ?? '',
    androidMemoryV1FixturePhotoMetadata.filename,
    ANDROID_MEMORY_V1_FIXTURE_PHOTO_BASE64,
  ]) {
    assert.equal(exportedCiphertext.includes(plaintext), false);
  }
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

test('错误密码不能解开 VMK', async () => {
  const { envelope } = await createTestVault();

  await assert.rejects(
    unlockVault(envelope, 'this password is wrong'),
    VaultUnlockError,
  );
});

test('同一条记忆重复加密会得到不同 IV 和密文', async () => {
  const { session } = await createTestVault();
  const first = await encryptMemory(session, sampleMemory);
  const second = await encryptMemory(session, sampleMemory);

  assert.notEqual(first.payload.iv, second.payload.iv);
  assert.notEqual(first.payload.ciphertext, second.payload.ciphertext);
});

test('记忆密文被修改后会触发完整性校验失败', async () => {
  const { session } = await createTestVault();
  const encrypted = await encryptMemory(session, sampleMemory);
  const tampered = structuredClone(encrypted);
  const lastCharacter = tampered.payload.ciphertext.at(-1);
  tampered.payload.ciphertext = `${tampered.payload.ciphertext.slice(0, -1)}${lastCharacter === 'A' ? 'B' : 'A'}`;

  await assert.rejects(
    decryptMemory(session, tampered),
    CipherIntegrityError,
  );
});

test('记忆 ID 被替换后会因 AAD 不匹配而失败', async () => {
  const { session } = await createTestVault();
  const encrypted = await encryptMemoryV1(session, sampleMemoryV1);
  const wrongAad = { ...encrypted, id: 'memory-v1-wrong-id' };

  await assert.rejects(
    decryptMemoryV1(session, wrongAad),
    CipherIntegrityError,
  );
});

test('所有照片共用 PhotoKey，但每次加密使用不同 IV', async () => {
  const { session } = await createTestVault();
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const metadata = { filename: 'lake.jpg', mimeType: 'image/jpeg' };
  const first = await encryptPhoto(session, bytes, metadata, { id: 'photo-001' });
  const second = await encryptPhoto(session, bytes, metadata, { id: 'photo-002' });

  assert.notEqual(first.content.iv, second.content.iv);

  const restored = await decryptPhoto(session, first);
  assert.deepEqual(restored.metadata, { ...metadata, byteLength: bytes.byteLength });
  assert.deepEqual(restored.bytes, bytes);
});

test('三档图片保持比例、不会放大小图，preview AAD 不能冒充缩略图', async () => {
  assert.deepEqual(fitPhotoWithin(4032, 3024, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitPhotoWithin(120, 80, 256), { width: 120, height: 80 });

  const { session } = await createTestVault();
  const bytes = new Uint8Array([10, 20, 30, 40]);
  const encrypted = await encryptPhoto(
    session,
    bytes,
    { filename: 'private-preview.jpg', mimeType: 'image/jpeg' },
    { id: 'preview-photo-001', kind: 'preview' },
  );
  assert.deepEqual((await decryptPhoto(session, encrypted)).bytes, bytes);
  await assert.rejects(decryptPhoto(session, { ...encrypted, kind: 'thumbnail' }));
});

test('锁定私密空间后，内存中的钥匙会被清零且不能继续使用', async () => {
  const { session } = await createTestVault();
  destroyVaultSession(session);

  assert.equal(session.destroyed, true);
  assert.deepEqual(session.vmk, new Uint8Array(32));
  assert.deepEqual(session.textKey, new Uint8Array(32));
  assert.deepEqual(session.photoKey, new Uint8Array(32));
  await assert.rejects(encryptMemory(session, sampleMemory), /私密空间已经锁定/);
});

test('导入时拒绝未知或不完整的密文包', () => {
  assert.throws(
    () => assertPrototypeBundle({ format: 'plain-text-export', memories: [] }),
    /密文包格式或版本不受支持/,
  );
});

test('正式 MemoryV1 可无损映射到地图阅读模型', () => {
  const memory: MemoryV1 = {
    schemaVersion: 1,
    id: 'map-memory-001',
    title: '西湖边的傍晚',
    text: '雨停以后沿着湖边慢慢走。',
    date: '2026-08-12',
    tags: ['散步', '杭州'],
    location: { name: '西湖', city: '杭州', country: '中国', lat: 30.246, lng: 120.15 },
    photos: [{ id: 'photo-001', mimeType: 'image/jpeg' }],
    createdAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
  };

  const display = toDisplayMemory({
    ...memory,
    photoUrls: ['blob:preview'],
    thumbnailUrls: ['blob:thumbnail'],
  });
  assert.equal(display.title, memory.title);
  assert.equal(display.pastSelf, memory.text);
  assert.equal(display.date, memory.date);
  assert.equal(display.year, 2026);
  assert.equal(display.country, '中国');
  assert.equal(display.city, '杭州');
  assert.equal(display.lat, 30.246);
  assert.equal(display.lng, 120.15);
  assert.equal(display.image, 'blob:thumbnail');
  assert.deepEqual(display.gallery, ['blob:preview']);
});
