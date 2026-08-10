import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type {
  EncryptedMemoryV1,
  EncryptedPhotoV1,
  VaultEnvelopeV1,
} from './contracts';

interface UserCipherData {
  vault: VaultEnvelopeV1 | null;
  memories: Record<string, EncryptedMemoryV1>;
  photos: Record<string, EncryptedPhotoV1>;
}

interface CipherStoreDocument {
  format: 'memory-recall-local-cipher-store';
  version: 1;
  users: Record<string, UserCipherData>;
}

export interface CipherStore {
  getVault(userId: string): Promise<VaultEnvelopeV1 | null>;
  putVault(userId: string, vault: VaultEnvelopeV1): Promise<void>;
  listMemories(userId: string): Promise<EncryptedMemoryV1[]>;
  putMemory(userId: string, memory: EncryptedMemoryV1): Promise<void>;
  getPhoto(userId: string, photoId: string): Promise<EncryptedPhotoV1 | null>;
  putPhoto(userId: string, photo: EncryptedPhotoV1): Promise<void>;
}

export class CipherConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CipherConflictError';
  }
}

function emptyDocument(): CipherStoreDocument {
  return {
    format: 'memory-recall-local-cipher-store',
    version: 1,
    users: {},
  };
}

function userData(document: CipherStoreDocument, userId: string): UserCipherData {
  return document.users[userId] ??= {
    vault: null,
    memories: {},
    photos: {},
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

export class JsonCipherStore implements CipherStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async readDocument(): Promise<CipherStoreDocument> {
    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<CipherStoreDocument>;
      if (
        value.format !== 'memory-recall-local-cipher-store' ||
        value.version !== 1 ||
        !value.users ||
        typeof value.users !== 'object'
      ) {
        throw new Error('本地密文存储格式无效。');
      }
      return value as CipherStoreDocument;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyDocument();
      }
      throw error;
    }
  }

  private async writeDocument(document: CipherStoreDocument): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }

  private mutate<T>(operation: (document: CipherStoreDocument) => Promise<T> | T): Promise<T> {
    const result = this.mutationQueue.then(async () => {
      const document = await this.readDocument();
      const value = await operation(document);
      await this.writeDocument(document);
      return value;
    });
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async afterMutations(): Promise<CipherStoreDocument> {
    await this.mutationQueue;
    return this.readDocument();
  }

  async getVault(userId: string): Promise<VaultEnvelopeV1 | null> {
    const document = await this.afterMutations();
    return structuredClone(document.users[userId]?.vault ?? null);
  }

  async putVault(userId: string, vault: VaultEnvelopeV1): Promise<void> {
    await this.mutate((document) => {
      userData(document, userId).vault = structuredClone(vault);
    });
  }

  async listMemories(userId: string): Promise<EncryptedMemoryV1[]> {
    const document = await this.afterMutations();
    return Object.values(document.users[userId]?.memories ?? {})
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((memory) => structuredClone(memory));
  }

  async putMemory(userId: string, memory: EncryptedMemoryV1): Promise<void> {
    await this.mutate((document) => {
      const memories = userData(document, userId).memories;
      const existing = memories[memory.id];
      if (existing && memory.version < existing.version) {
        throw new CipherConflictError('服务器已有更新版本的记忆密文。');
      }
      if (existing && memory.version === existing.version && !sameJson(existing, memory)) {
        throw new CipherConflictError('同一版本对应了不同的记忆密文。');
      }
      memories[memory.id] = structuredClone(memory);
    });
  }

  async getPhoto(userId: string, photoId: string): Promise<EncryptedPhotoV1 | null> {
    const document = await this.afterMutations();
    return structuredClone(document.users[userId]?.photos[photoId] ?? null);
  }

  async putPhoto(userId: string, photo: EncryptedPhotoV1): Promise<void> {
    await this.mutate((document) => {
      const photos = userData(document, userId).photos;
      const existing = photos[photo.id];
      if (existing && !sameJson(existing, photo)) {
        throw new CipherConflictError('同一照片 ID 对应了不同的密文。');
      }
      photos[photo.id] = structuredClone(photo);
    });
  }
}
