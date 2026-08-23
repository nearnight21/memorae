import {
  decryptMemoryV2,
  encryptMemoryV2,
  type CryptoPrimitives,
  type EncryptedMemoryV1,
  type MemoryV2,
  type VaultSessionV1,
} from '../crypto';

export interface MemoryCipherStorage {
  listMemories(): Promise<EncryptedMemoryV1[]>;
  saveMemory(memory: EncryptedMemoryV1): Promise<void>;
}

export interface DecryptedMemorySnapshot {
  memories: MemoryV2[];
  migratedCount: number;
  decryptFailedCount: number;
  decryptErrorTypes: string[];
}

/** Loads encrypted memories and keeps the V1-to-V2 upgrade local to the device. */
export async function loadDecryptedMemories(
  primitives: CryptoPrimitives,
  session: VaultSessionV1,
  storage: MemoryCipherStorage,
): Promise<DecryptedMemorySnapshot> {
  const decrypted: MemoryV2[] = [];
  let migratedCount = 0;
  let decryptFailedCount = 0;
  const decryptErrorTypes: string[] = [];

  for (const item of await storage.listMemories()) {
    if (item.deleted) continue;
    let result: Awaited<ReturnType<typeof decryptMemoryV2>>;
    try {
      result = await decryptMemoryV2(primitives, session, item);
    } catch (error) {
      decryptFailedCount += 1;
      const errorType = error instanceof Error && error.constructor.name
        ? error.constructor.name
        : 'UnknownError';
      if (!decryptErrorTypes.includes(errorType)) decryptErrorTypes.push(errorType);
      continue;
    }
    decrypted.push(result.memory);
    if (result.migrated) {
      await storage.saveMemory(await encryptMemoryV2(
        primitives,
        session,
        result.memory,
        item.version + 1,
      ));
      migratedCount += 1;
    }
  }

  decrypted.sort((left, right) => right.date.localeCompare(left.date));
  return { memories: decrypted, migratedCount, decryptFailedCount, decryptErrorTypes };
}
