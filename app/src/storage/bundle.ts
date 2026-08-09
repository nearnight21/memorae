import type {
  EncryptedMemoryV1,
  EncryptedPhotoV1,
  VaultEnvelopeV1,
} from '../crypto';
import { assertVaultEnvelope } from '../crypto';
import {
  clearEncryptedContent,
  listEncryptedMemories,
  listEncryptedPhotos,
  saveEncryptedMemory,
  saveEncryptedPhoto,
  saveVaultEnvelope,
} from './database';

export interface PrototypeBundleV1 {
  format: 'memory-recall-encrypted-bundle';
  bundleVersion: 1;
  exportedAt: string;
  vault: VaultEnvelopeV1;
  memories: EncryptedMemoryV1[];
  photos: EncryptedPhotoV1[];
}
export function assertPrototypeBundle(value: unknown): asserts value is PrototypeBundleV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('文件不是有效的加密包。');
  }
  const bundle = value as Partial<PrototypeBundleV1>;
  if (
    bundle.format !== 'memory-recall-encrypted-bundle' ||
    bundle.bundleVersion !== 1 ||
    !Array.isArray(bundle.memories) ||
    !Array.isArray(bundle.photos)
  ) {
    throw new Error('加密包格式或版本不受支持。');
  }
  assertVaultEnvelope(bundle.vault);
}

export async function createEncryptedBundle(
  vault: VaultEnvelopeV1,
): Promise<PrototypeBundleV1> {
  const [memories, photos] = await Promise.all([
    listEncryptedMemories(),
    listEncryptedPhotos(),
  ]);
  return {
    format: 'memory-recall-encrypted-bundle',
    bundleVersion: 1,
    exportedAt: new Date().toISOString(),
    vault,
    memories,
    photos,
  };
}

export async function replaceWithEncryptedBundle(bundle: PrototypeBundleV1): Promise<void> {
  assertPrototypeBundle(bundle);
  await clearEncryptedContent();
  await saveVaultEnvelope(bundle.vault);
  for (const memory of bundle.memories) {
    await saveEncryptedMemory(memory);
  }
  for (const photo of bundle.photos) {
    await saveEncryptedPhoto(photo);
  }
}
