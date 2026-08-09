import { base64ToBytes, bytesToBase64, utf8 } from './encoding';
import {
  AES_GCM,
  CRYPTO_VERSION,
  VAULT_SCHEMA,
  type Argon2idParameters,
  type CryptoPrimitives,
  type SealedBytesV1,
  type VaultEnvelopeV1,
  type VaultSessionV1,
} from './types';

const VMK_AAD = 'memory-recall:v1:key:vmk';
const TEXT_KEY_AAD = 'memory-recall:v1:key:text';
const PHOTO_KEY_AAD = 'memory-recall:v1:key:photo';

export interface CreateVaultOptions {
  memoryKiB?: number;
  iterations?: number;
  parallelism?: number;
}
export class VaultUnlockError extends Error {
  constructor() {
    super('私密空间密码错误，或密钥数据已经损坏。');
    this.name = 'VaultUnlockError';
  }
}

export class CipherIntegrityError extends Error {
  constructor() {
    super('密文无法通过完整性校验。');
    this.name = 'CipherIntegrityError';
  }
}

function assertPassword(password: string): void {
  if (!password) {
    throw new Error('私密空间密码不能为空。');
  }
}

export function assertVaultEnvelope(value: unknown): asserts value is VaultEnvelopeV1 {
  const envelope = value as Partial<VaultEnvelopeV1> | null;
  if (
    !envelope ||
    envelope.schema !== VAULT_SCHEMA ||
    envelope.cryptoVersion !== CRYPTO_VERSION ||
    envelope.kdf?.name !== 'Argon2id' ||
    envelope.kdf.hashLength !== 32 ||
    !envelope.wrappedVmk ||
    !envelope.wrappedKeys?.text ||
    !envelope.wrappedKeys.photo
  ) {
    throw new VaultUnlockError();
  }
}

async function deriveUnlockKey(
  primitives: CryptoPrimitives,
  password: string,
  kdf: Argon2idParameters,
): Promise<Uint8Array> {
  const passwordBytes = utf8(password);
  try {
    return await primitives.argon2id({
      password: passwordBytes,
      salt: base64ToBytes(kdf.salt),
      memoryKiB: kdf.memoryKiB,
      iterations: kdf.iterations,
      parallelism: kdf.parallelism,
      hashLength: kdf.hashLength,
    });
  } finally {
    passwordBytes.fill(0);
  }
}

export async function sealBytes(
  primitives: CryptoPrimitives,
  rawKey: Uint8Array,
  plaintext: Uint8Array,
  aad: string,
): Promise<SealedBytesV1> {
  const iv = await primitives.randomBytes(12);
  const ciphertext = await primitives.aesGcmEncrypt({
    key: rawKey,
    plaintext,
    iv,
    aad: utf8(aad),
  });

  return {
    algorithm: AES_GCM,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export async function openBytes(
  primitives: CryptoPrimitives,
  rawKey: Uint8Array,
  sealed: SealedBytesV1,
  aad: string,
): Promise<Uint8Array> {
  if (sealed.algorithm !== AES_GCM) {
    throw new CipherIntegrityError();
  }

  try {
    return await primitives.aesGcmDecrypt({
      key: rawKey,
      ciphertextWithTag: base64ToBytes(sealed.ciphertext),
      iv: base64ToBytes(sealed.iv),
      aad: utf8(aad),
    });
  } catch {
    throw new CipherIntegrityError();
  }
}

export async function createVault(
  primitives: CryptoPrimitives,
  password: string,
  options: CreateVaultOptions = {},
): Promise<{ envelope: VaultEnvelopeV1; session: VaultSessionV1 }> {
  assertPassword(password);

  const [vmk, textKey, photoKey, salt] = await Promise.all([
    primitives.randomBytes(32),
    primitives.randomBytes(32),
    primitives.randomBytes(32),
    primitives.randomBytes(16),
  ]);
  const kdf: Argon2idParameters = {
    name: 'Argon2id',
    salt: bytesToBase64(salt),
    memoryKiB: options.memoryKiB ?? 64 * 1024,
    iterations: options.iterations ?? 3,
    parallelism: options.parallelism ?? 1,
    hashLength: 32,
  };
  const unlockKey = await deriveUnlockKey(primitives, password, kdf);

  try {
    const envelope: VaultEnvelopeV1 = {
      schema: VAULT_SCHEMA,
      cryptoVersion: CRYPTO_VERSION,
      createdAt: new Date().toISOString(),
      kdf,
      wrappedVmk: await sealBytes(primitives, unlockKey, vmk, VMK_AAD),
      wrappedKeys: {
        text: await sealBytes(primitives, vmk, textKey, TEXT_KEY_AAD),
        photo: await sealBytes(primitives, vmk, photoKey, PHOTO_KEY_AAD),
      },
    };

    return {
      envelope,
      session: {
        cryptoVersion: CRYPTO_VERSION,
        vmk,
        textKey,
        photoKey,
        destroyed: false,
      },
    };
  } finally {
    unlockKey.fill(0);
  }
}

export async function sessionFromVmk(
  primitives: CryptoPrimitives,
  envelope: VaultEnvelopeV1,
  vmk: Uint8Array,
): Promise<VaultSessionV1> {
  assertVaultEnvelope(envelope);
  const [textKey, photoKey] = await Promise.all([
    openBytes(primitives, vmk, envelope.wrappedKeys.text, TEXT_KEY_AAD),
    openBytes(primitives, vmk, envelope.wrappedKeys.photo, PHOTO_KEY_AAD),
  ]);

  return {
    cryptoVersion: CRYPTO_VERSION,
    vmk,
    textKey,
    photoKey,
    destroyed: false,
  };
}

export async function unlockVault(
  primitives: CryptoPrimitives,
  envelope: VaultEnvelopeV1,
  password: string,
): Promise<VaultSessionV1> {
  assertPassword(password);
  assertVaultEnvelope(envelope);
  const unlockKey = await deriveUnlockKey(primitives, password, envelope.kdf);

  try {
    const vmk = await openBytes(primitives, unlockKey, envelope.wrappedVmk, VMK_AAD);
    return await sessionFromVmk(primitives, envelope, vmk);
  } catch {
    throw new VaultUnlockError();
  } finally {
    unlockKey.fill(0);
  }
}

export function assertActiveSession(session: VaultSessionV1): void {
  if (session.destroyed) {
    throw new Error('私密空间已经锁定。');
  }
}

export function destroyVaultSession(session: VaultSessionV1): void {
  session.vmk.fill(0);
  session.textKey.fill(0);
  session.photoKey.fill(0);
  session.destroyed = true;
}
