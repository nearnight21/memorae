import type { Memory } from '../types';
import {
  decryptMemoryV2,
  decryptPhoto,
  encryptMemoryV2,
  encryptPhoto,
  type EncryptedMemoryV1,
  type EncryptedPhotoV1,
  type MemoryPhotoV1,
  type MemoryV2,
  type VaultSessionV1,
} from '../crypto';
import { createJpegPhotoVariant, PHOTO_VARIANT_SPECS } from '../photos/photoVariants';
import {
  deleteEncryptedPhotoVariants,
  listEncryptedMemories,
  listEncryptedPhotos,
  saveEncryptedMemory,
  saveEncryptedPhoto,
} from '../prototype/storage';
import { getRegisteredPhoto, registerDecryptedPhoto, revokeRegisteredPhotos } from './photoRegistry';

const MAX_PHOTO_BYTES = 30 * 1024 * 1024;

function displayDate(date: string): string {
  return date.replaceAll('-', '.');
}

function storedDate(date: string): string {
  return date.replaceAll('.', '-');
}

function toDisplayMemory(memory: MemoryV2, photoUrls: string[]): Memory {
  return {
    id: memory.id,
    title: memory.title,
    date: displayDate(memory.date),
    year: Number(memory.date.slice(0, 4)),
    category: memory.category,
    tag: memory.tag,
    image: photoUrls[0] ?? '',
    gallery: photoUrls.slice(1),
    photoIds: memory.photos.map((photo) => photo.id),
    pastSelf: memory.pastSelf,
    presentSelf: memory.presentSelf,
    pinnedBy: memory.pinnedBy,
    px: memory.board.px,
    py: memory.board.py,
    rotation: memory.board.rotation,
    location: memory.location
      ? { name: memory.location.name, mx: memory.location.mx, my: memory.location.my }
      : undefined,
    country: memory.location?.country,
    city: memory.location?.city,
    lat: memory.location?.lat,
    lng: memory.location?.lng,
    detailLocation: memory.location?.detail,
  };
}

/**
 * Original files stay encrypted until a reader explicitly asks for one. The
 * normal map view continues to use the preview variant returned by
 * loadProductMemories.
 */
export async function loadProductOriginalPhoto(session: VaultSessionV1, photoId: string): Promise<string> {
  const original = (await listEncryptedPhotos()).find((photo) => (
    photo.id === photoId && photo.kind === 'original'
  ));
  if (!original) throw new Error('原图不可用。');
  const decrypted = await decryptPhoto(session, original);
  try {
    const url = URL.createObjectURL(new Blob([decrypted.bytes], { type: decrypted.metadata.mimeType }));
    registerDecryptedPhoto(url, photoId, decrypted.metadata.mimeType);
    return url;
  } finally {
    decrypted.bytes.fill(0);
  }
}

async function decryptDisplayPhoto(
  session: VaultSessionV1,
  photoId: string,
  photoMap: Map<string, EncryptedPhotoV1>,
): Promise<string> {
  const encrypted = photoMap.get(`${photoId}:preview`)
    ?? photoMap.get(`${photoId}:original`)
    ?? photoMap.get(`${photoId}:thumbnail`);
  if (!encrypted) throw new Error(`缺少照片密文：${photoId}。`);
  const decrypted = await decryptPhoto(session, encrypted);
  const url = URL.createObjectURL(new Blob([decrypted.bytes], { type: decrypted.metadata.mimeType }));
  decrypted.bytes.fill(0);
  registerDecryptedPhoto(url, photoId, decrypted.metadata.mimeType);
  return url;
}

export async function loadProductMemories(session: VaultSessionV1): Promise<Memory[]> {
  revokeRegisteredPhotos();
  const [encryptedMemories, encryptedPhotos] = await Promise.all([
    listEncryptedMemories(),
    listEncryptedPhotos(),
  ]);
  const photoMap = new Map(encryptedPhotos.map((photo) => [`${photo.id}:${photo.kind}`, photo]));
  const visible: Memory[] = [];
  for (const encrypted of encryptedMemories) {
    if (encrypted.deleted) continue;
    const result = await decryptMemoryV2(session, encrypted);
    if (result.migrated) {
      await saveEncryptedMemory(await encryptMemoryV2(session, result.memory, encrypted.version + 1));
    }
    const urls = await Promise.all(result.memory.photos.map(({ id }) => decryptDisplayPhoto(session, id, photoMap)));
    visible.push(toDisplayMemory(result.memory, urls));
  }
  return visible.sort((left, right) => right.date.localeCompare(left.date));
}

async function encryptNewPhoto(session: VaultSessionV1, file: File): Promise<MemoryPhotoV1> {
  if (file.size > MAX_PHOTO_BYTES) throw new Error('单张照片不能超过 30 MiB。');
  const id = crypto.randomUUID();
  try {
    for (const spec of PHOTO_VARIANT_SPECS) {
      const bytes = await createJpegPhotoVariant(file, spec);
      try {
        await saveEncryptedPhoto(await encryptPhoto(
          session,
          bytes,
          { filename: file.name, mimeType: 'image/jpeg' },
          { id, kind: spec.kind },
        ));
      } finally {
        bytes.fill(0);
      }
    }
    const original = new Uint8Array(await file.arrayBuffer());
    try {
      await saveEncryptedPhoto(await encryptPhoto(
        session,
        original,
        { filename: file.name, mimeType: file.type || 'application/octet-stream' },
        { id, kind: 'original' },
      ));
    } finally {
      original.fill(0);
    }
    return { id, mimeType: file.type || 'application/octet-stream' };
  } catch (error) {
    await deleteEncryptedPhotoVariants(id).catch(() => undefined);
    throw error;
  }
}

async function photoReferences(session: VaultSessionV1, memory: Memory): Promise<MemoryPhotoV1[]> {
  const refs: MemoryPhotoV1[] = [];
  for (const url of [memory.image, ...memory.gallery].filter(Boolean)) {
    const registered = getRegisteredPhoto(url);
    if (!registered) throw new Error('记忆包含未加密的网络图片，请改为选择本机照片。');
    if (registered.id) {
      refs.push({ id: registered.id, mimeType: registered.mimeType });
    } else if (registered.file) {
      const ref = await encryptNewPhoto(session, registered.file);
      registerDecryptedPhoto(url, ref.id, ref.mimeType);
      refs.push(ref);
    }
  }
  return refs;
}

function toMemoryV2(memory: Memory, photos: MemoryPhotoV1[], previous?: MemoryV2): MemoryV2 {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: memory.id,
    title: memory.title.trim(),
    date: storedDate(memory.date),
    category: memory.category,
    tag: memory.tag,
    pastSelf: memory.pastSelf,
    presentSelf: memory.presentSelf,
    pinnedBy: memory.pinnedBy,
    board: { px: memory.px, py: memory.py, rotation: memory.rotation },
    location: memory.location
      ? {
          name: memory.location.name,
          mx: memory.location.mx,
          my: memory.location.my,
          country: memory.country,
          city: memory.city,
          lat: memory.lat,
          lng: memory.lng,
          detail: memory.detailLocation,
        }
      : null,
    photos,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

async function currentEncrypted(memoryId: string): Promise<EncryptedMemoryV1 | undefined> {
  return (await listEncryptedMemories()).find((memory) => memory.id === memoryId);
}

export async function saveProductMemory(session: VaultSessionV1, memory: Memory): Promise<void> {
  const current = await currentEncrypted(memory.id);
  const previous = current && !current.deleted ? (await decryptMemoryV2(session, current)).memory : undefined;
  const photos = await photoReferences(session, memory);
  const next = toMemoryV2(memory, photos, previous);
  await saveEncryptedMemory(await encryptMemoryV2(session, next, (current?.version ?? 0) + 1));
}

export async function deleteProductMemory(memoryId: string): Promise<void> {
  const current = await currentEncrypted(memoryId);
  if (!current) return;
  await saveEncryptedMemory({ ...current, version: current.version + 1, deleted: true });
}
