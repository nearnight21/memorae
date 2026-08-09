import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  base64ToBytes,
  bytesToHex,
  createVault,
  decryptMemory,
  decryptPhoto,
  destroyVaultSession,
  encryptMemory,
  encryptPhoto,
  unlockVault,
  VaultUnlockError,
  type EncryptedMemoryV1,
  type EncryptedPhotoV1,
  type VaultEnvelopeV1,
} from '../src/crypto';
import { nodeCryptoPrimitives } from './support/nodePrimitives';

const TEST_KDF = {
  memoryKiB: 8 * 1024,
  iterations: 2,
  parallelism: 1,
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

async function loadWebFixture(): Promise<WebFixture> {
  const value = await readFile(
    new URL('./fixtures/web-v1-bundle.json', import.meta.url),
    'utf8',
  );
  return JSON.parse(value) as WebFixture;
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
