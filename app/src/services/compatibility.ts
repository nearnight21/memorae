import fixtureJson from '../../tests/fixtures/web-v1-bundle.json';
import {
  base64ToBytes,
  bytesToHex,
  decodeUtf8,
  decryptMemory,
  decryptPhoto,
  destroyVaultSession,
  unlockVault,
  utf8,
  type EncryptedMemoryV1,
  type EncryptedPhotoV1,
  type VaultEnvelopeV1,
} from '../crypto';
import { nativeCryptoPrimitives } from '../crypto/nativePrimitives';

interface CompatibilityFixture {
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

export interface CompatibilityResult {
  argon2Milliseconds: number;
  aesMilliseconds: number;
  webBundleMilliseconds: number;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

export async function runNativeCompatibilityCheck(): Promise<CompatibilityResult> {
  const aesStart = performance.now();
  const key = Uint8Array.from({ length: 32 }, (_, index) => index);
  const iv = Uint8Array.from({ length: 12 }, (_, index) => index + 32);
  const aad = utf8('memory-recall:native-web-vector');
  const plaintext = utf8('Android encrypts, web decrypts.');
  const encrypted = await nativeCryptoPrimitives.aesGcmEncrypt({
    key,
    iv,
    aad,
    plaintext,
  });
  if (bytesToHex(encrypted) !== '9354c20203f17e2e7f1221bcb868808afc699bf9e5a0078b0f8415623df970c559d9e3785b1daaf9346b4012f9a9c5') {
    throw new Error('Android AES-GCM 输出与网页固定向量不一致。');
  }
  const reopened = await nativeCryptoPrimitives.aesGcmDecrypt({
    key,
    iv,
    aad,
    ciphertextWithTag: encrypted,
  });
  if (decodeUtf8(reopened) !== 'Android encrypts, web decrypts.') {
    throw new Error('Android AES-GCM 固定向量无法往返解密。');
  }
  const aesMilliseconds = performance.now() - aesStart;
  key.fill(0);
  plaintext.fill(0);
  reopened.fill(0);

  const argonStart = performance.now();
  const derived = await nativeCryptoPrimitives.argon2id({
    password: new TextEncoder().encode('ABCD2345'),
    salt: new Uint8Array(16).fill(7),
    memoryKiB: 65536,
    iterations: 3,
    parallelism: 1,
    hashLength: 32,
  });
  const argon2Milliseconds = performance.now() - argonStart;
  if (bytesToHex(derived) !== '7d0e2bc7e36bfc948fe53381065a22857b5a4612ef6770ce16719e8f04f8b53d') {
    throw new Error('Android 原生 Argon2id 与网页固定向量不一致。');
  }
  derived.fill(0);

  const fixture = fixtureJson as unknown as CompatibilityFixture;
  const bundleStart = performance.now();
  const session = await unlockVault(
    nativeCryptoPrimitives,
    fixture.bundle.vault,
    fixture.password,
  );
  try {
    const [memory, photo] = await Promise.all([
      decryptMemory<Record<string, unknown>>(
        nativeCryptoPrimitives,
        session,
        fixture.bundle.memories[0],
      ),
      decryptPhoto(
        nativeCryptoPrimitives,
        session,
        fixture.bundle.photos[0],
      ),
    ]);
    if (JSON.stringify(memory) !== JSON.stringify(fixture.expected.memory)) {
      throw new Error('Android 解开的网页记忆内容不一致。');
    }
    if (!equalBytes(photo.bytes, base64ToBytes(fixture.expected.photoBytesBase64))) {
      throw new Error('Android 解开的网页照片内容不一致。');
    }
  } finally {
    destroyVaultSession(session);
  }

  return {
    argon2Milliseconds,
    aesMilliseconds,
    webBundleMilliseconds: performance.now() - bundleStart,
  };
}
