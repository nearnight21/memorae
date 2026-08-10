import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CipherIntegrityError,
  createVault,
  decryptMemory,
  decryptPhoto,
  destroyVaultSession,
  encryptMemory,
  encryptPhoto,
  unlockVault,
  VaultUnlockError,
  type EncryptedMemoryV1,
  type VaultEnvelopeV1,
} from '../src/crypto';
import { assertPrototypeBundle } from '../src/prototype/storage';

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
