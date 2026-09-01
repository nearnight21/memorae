import { File, Paths } from 'expo-file-system';

import { base64ToBytes } from '../crypto';
import type { MemoryMapMarker } from './MemoraeMap.types';
import { resolveMapThumbnail } from './mapThumbnailCache';

interface NativeThumbnailEntry {
  sourceUri: string;
  file: File;
}

const nativeThumbnailFiles = new Map<string, NativeThumbnailEntry>();

function opaqueFileName(cacheKey: string, sourceUri: string): string {
  let hash = 2166136261;
  for (const character of `${cacheKey}\u0000${sourceUri}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `memorae-map-${(hash >>> 0).toString(16)}.jpg`;
}

function deleteFile(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best-effort and must never block lock or map teardown.
  }
}

export function materializeNativeMapThumbnail(marker: MemoryMapMarker): string | undefined {
  const thumbnail = marker.thumbnail;
  if (!thumbnail) return undefined;
  const existing = nativeThumbnailFiles.get(thumbnail.cacheKey);
  if (existing?.sourceUri === thumbnail.uri && existing.file.exists) return existing.file.uri;
  if (existing) deleteFile(existing.file);

  const dataUri = resolveMapThumbnail(thumbnail);
  const encoded = dataUri?.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i)?.[1];
  if (!encoded) return undefined;

  const bytes = base64ToBytes(encoded);
  try {
    const file = new File(Paths.cache, opaqueFileName(thumbnail.cacheKey, thumbnail.uri));
    file.create({ overwrite: true, intermediates: true });
    file.write(bytes);
    nativeThumbnailFiles.set(thumbnail.cacheKey, { sourceUri: thumbnail.uri, file });
    return file.uri;
  } catch {
    return undefined;
  } finally {
    bytes.fill(0);
  }
}

export function pruneNativeMapThumbnailFiles(activeCacheKeys: ReadonlySet<string>): void {
  for (const [cacheKey, entry] of nativeThumbnailFiles) {
    if (activeCacheKeys.has(cacheKey)) continue;
    deleteFile(entry.file);
    nativeThumbnailFiles.delete(cacheKey);
  }
}

export function resetNativeMapThumbnailFiles(): void {
  for (const entry of nativeThumbnailFiles.values()) deleteFile(entry.file);
  nativeThumbnailFiles.clear();
}
