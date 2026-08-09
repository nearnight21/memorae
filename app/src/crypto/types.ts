export const CRYPTO_VERSION = 1 as const;
export const VAULT_SCHEMA = 'memory-recall-vault' as const;
export const AES_GCM = 'AES-256-GCM' as const;

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

export interface Argon2idInput {
  password: Uint8Array;
  salt: Uint8Array;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
}

export interface CryptoPrimitives {
  randomBytes(length: number): Promise<Uint8Array>;
  randomUUID(): string;
  argon2id(input: Argon2idInput): Promise<Uint8Array>;
  aesGcmEncrypt(input: {
    key: Uint8Array;
    plaintext: Uint8Array;
    iv: Uint8Array;
    aad: Uint8Array;
  }): Promise<Uint8Array>;
  aesGcmDecrypt(input: {
    key: Uint8Array;
    ciphertextWithTag: Uint8Array;
    iv: Uint8Array;
    aad: Uint8Array;
  }): Promise<Uint8Array>;
}
