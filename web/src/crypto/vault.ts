import { argon2id } from 'hash-wasm';
import { base64ToBytes, bytesToBase64, randomBytes, utf8 } from './encoding';

export const CRYPTO_VERSION = 1 as const;

const VAULT_SCHEMA = 'memory-recall-vault';
const AES_GCM = 'AES-256-GCM';
const VMK_AAD = 'memory-recall:v1:key:vmk';
const TEXT_KEY_AAD = 'memory-recall:v1:key:text';
const PHOTO_KEY_AAD = 'memory-recall:v1:key:photo';

export interface Argon2idParameters {
  name: 'Argon2id';
  salt: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: 32;
}

export interface SealedBytesV1 {
  algorithm: typeof AES_GCM;
  iv: string;
  ciphertext: string;
}

export interface VaultEnvelopeV1 {
  schema: typeof VAULT_SCHEMA;
  cryptoVersion: typeof CRYPTO_VERSION;
  createdAt: string;
  kdf: Argon2idParameters;
  wrappedVmk: SealedBytesV1;
  wrappedKeys: {
    text: SealedBytesV1;
    photo: SealedBytesV1;
  };
}

export interface VaultSessionV1 {
  cryptoVersion: typeof CRYPTO_VERSION;
  vmk: Uint8Array;
  textKey: Uint8Array;
  photoKey: Uint8Array;
  destroyed: boolean;
}

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

function assertVaultEnvelope(envelope: VaultEnvelopeV1): void {
  if (
    envelope.schema !== VAULT_SCHEMA ||
    envelope.cryptoVersion !== CRYPTO_VERSION ||
    envelope.kdf.name !== 'Argon2id' ||
    envelope.kdf.hashLength !== 32
  ) {
    throw new VaultUnlockError();
  }
}

async function deriveUnlockKey(password: string, kdf: Argon2idParameters): Promise<Uint8Array> {
  const result = await argon2id({
    password,
    salt: base64ToBytes(kdf.salt),
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memoryKiB,
    hashLength: kdf.hashLength,
    outputType: 'binary',
  });

  return result;
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function sealBytes(
  rawKey: Uint8Array,
  plaintext: Uint8Array,
  aad: string,
): Promise<SealedBytesV1> {
  const key = await importAesKey(rawKey);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad), tagLength: 128 },
    key,
    plaintext,
  );

  return {
    algorithm: AES_GCM,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function openBytes(
  rawKey: Uint8Array,
  sealed: SealedBytesV1,
  aad: string,
): Promise<Uint8Array> {
  if (sealed.algorithm !== AES_GCM) {
    throw new CipherIntegrityError();
  }

  try {
    const key = await importAesKey(rawKey);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(sealed.iv),
        additionalData: utf8(aad),
        tagLength: 128,
      },
      key,
      base64ToBytes(sealed.ciphertext),
    );

    return new Uint8Array(plaintext);
  } catch {
    throw new CipherIntegrityError();
  }
}

export async function createVault(
  password: string,
  options: CreateVaultOptions = {},
): Promise<{ envelope: VaultEnvelopeV1; session: VaultSessionV1 }> {
  assertPassword(password);

  const vmk = randomBytes(32);
  const textKey = randomBytes(32);
  const photoKey = randomBytes(32);
  const kdf: Argon2idParameters = {
    name: 'Argon2id',
    salt: bytesToBase64(randomBytes(16)),
    memoryKiB: options.memoryKiB ?? 64 * 1024,
    iterations: options.iterations ?? 3,
    parallelism: options.parallelism ?? 1,
    hashLength: 32,
  };

  const unlockKey = await deriveUnlockKey(password, kdf);

  try {
    const envelope: VaultEnvelopeV1 = {
      schema: VAULT_SCHEMA,
      cryptoVersion: CRYPTO_VERSION,
      createdAt: new Date().toISOString(),
      kdf,
      wrappedVmk: await sealBytes(unlockKey, vmk, VMK_AAD),
      wrappedKeys: {
        text: await sealBytes(vmk, textKey, TEXT_KEY_AAD),
        photo: await sealBytes(vmk, photoKey, PHOTO_KEY_AAD),
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

export async function unlockVault(
  envelope: VaultEnvelopeV1,
  password: string,
): Promise<VaultSessionV1> {
  assertPassword(password);
  assertVaultEnvelope(envelope);

  const unlockKey = await deriveUnlockKey(password, envelope.kdf);

  try {
    const vmk = await openBytes(unlockKey, envelope.wrappedVmk, VMK_AAD);
    const [textKey, photoKey] = await Promise.all([
      openBytes(vmk, envelope.wrappedKeys.text, TEXT_KEY_AAD),
      openBytes(vmk, envelope.wrappedKeys.photo, PHOTO_KEY_AAD),
    ]);

    return {
      cryptoVersion: CRYPTO_VERSION,
      vmk,
      textKey,
      photoKey,
      destroyed: false,
    };
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
