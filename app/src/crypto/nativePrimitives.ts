import { argon2id } from '@sonnetstationsolutions/expo-argon2';
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomBytesAsync,
  randomUUID,
} from 'expo-crypto';
import type { CryptoPrimitives } from './types';

export const nativeCryptoPrimitives: CryptoPrimitives = {
  randomBytes: getRandomBytesAsync,
  randomUUID,
  argon2id: async (input) => argon2id({
    password: input.password,
    salt: input.salt,
    memory: input.memoryKiB,
    iterations: input.iterations,
    parallelism: input.parallelism,
    hashLength: input.hashLength,
  }),
  aesGcmEncrypt: async ({ key, plaintext, iv, aad }) => {
    const importedKey = await AESEncryptionKey.import(key);
    const sealed = await aesEncryptAsync(plaintext, importedKey, {
      nonce: { bytes: iv },
      tagLength: 16,
      additionalData: aad,
    });
    return sealed.ciphertext({ includeTag: true });
  },
  aesGcmDecrypt: async ({ key, ciphertextWithTag, iv, aad }) => {
    const importedKey = await AESEncryptionKey.import(key);
    const sealed = AESSealedData.fromParts(iv, ciphertextWithTag, 16);
    return aesDecryptAsync(sealed, importedKey, {
      output: 'bytes',
      additionalData: aad,
    });
  },
};
