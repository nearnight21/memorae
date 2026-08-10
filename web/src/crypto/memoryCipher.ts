import { decodeUtf8, utf8 } from './encoding';
import {
  assertActiveSession,
  CRYPTO_VERSION,
  openBytes,
  sealBytes,
  type SealedBytesV1,
  type VaultSessionV1,
} from './vault';

export interface EncryptedMemoryV1 {
  id: string;
  version: number;
  cryptoVersion: typeof CRYPTO_VERSION;
  deleted: boolean;
  payload: SealedBytesV1;
}

function memoryAad(id: string, version: number): string {
  return `memory-recall:v1:memory:${id}:version:${version}`;
}

export async function encryptMemory<T extends { id: string }>(
  session: VaultSessionV1,
  memory: T,
  version = 1,
): Promise<EncryptedMemoryV1> {
  assertActiveSession(session);

  if (!memory.id || version < 1 || !Number.isInteger(version)) {
    throw new Error('记忆 ID 和版本号无效。');
  }

  return {
    id: memory.id,
    version,
    cryptoVersion: CRYPTO_VERSION,
    deleted: false,
    payload: await sealBytes(
      session.textKey,
      utf8(JSON.stringify(memory)),
      memoryAad(memory.id, version),
    ),
  };
}

export async function decryptMemory<T>(
  session: VaultSessionV1,
  encrypted: EncryptedMemoryV1,
): Promise<T> {
  assertActiveSession(session);

  if (encrypted.cryptoVersion !== CRYPTO_VERSION || encrypted.deleted) {
    throw new Error('记忆密文版本无效，或记录已经删除。');
  }

  const plaintext = await openBytes(
    session.textKey,
    encrypted.payload,
    memoryAad(encrypted.id, encrypted.version),
  );

  return JSON.parse(decodeUtf8(plaintext)) as T;
}
