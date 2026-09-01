import { bytesToBase64 } from '../crypto';
import type { MemoryMapThumbnail } from './MemoraeMap.types';

interface MapThumbnailCacheEntry {
  uri: string;
  dataUri: string;
}

const thumbnailCache = new Map<string, MapThumbnailCacheEntry>();

function thumbnailUri(cacheKey: string): string {
  return `memorae-thumbnail:///${encodeURIComponent(cacheKey)}`;
}

export function registerMapThumbnail(
  cacheKey: string,
  bytes: Uint8Array,
): MemoryMapThumbnail {
  const uri = thumbnailUri(cacheKey);
  thumbnailCache.set(cacheKey, {
    uri,
    dataUri: `data:image/jpeg;base64,${bytesToBase64(bytes)}`,
  });
  return { uri, cacheKey };
}

export function resolveMapThumbnail(
  thumbnail: MemoryMapThumbnail,
): string | undefined {
  const cached = thumbnailCache.get(thumbnail.cacheKey);
  return cached?.uri === thumbnail.uri ? cached.dataUri : undefined;
}

export function resetMapThumbnailCache(): void {
  thumbnailCache.clear();
}
