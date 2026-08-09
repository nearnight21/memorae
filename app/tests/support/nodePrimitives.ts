import { randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { argon2id } from 'hash-wasm';
import type { CryptoPrimitives } from '../../src/crypto/types';

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

async function importKey(value: Uint8Array) {
  return webcrypto.subtle.importKey(
    'raw',
    arrayBuffer(value),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export const nodeCryptoPrimitives: CryptoPrimitives = {
  randomBytes: async (length) => new Uint8Array(randomBytes(length)),
  randomUUID,
  argon2id: async (input) => argon2id({
    password: input.password,
    salt: input.salt,
    parallelism: input.parallelism,
    iterations: input.iterations,
    memorySize: input.memoryKiB,
    hashLength: input.hashLength,
    outputType: 'binary',
  }),
  aesGcmEncrypt: async ({ key, plaintext, iv, aad }) => {
    const result = await webcrypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: arrayBuffer(iv),
        additionalData: arrayBuffer(aad),
        tagLength: 128,
      },
      await importKey(key),
      arrayBuffer(plaintext),
    );
    return new Uint8Array(result);
  },
  aesGcmDecrypt: async ({ key, ciphertextWithTag, iv, aad }) => {
    const result = await webcrypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: arrayBuffer(iv),
        additionalData: arrayBuffer(aad),
        tagLength: 128,
      },
      await importKey(key),
      arrayBuffer(ciphertextWithTag),
    );
    return new Uint8Array(result);
  },
};
