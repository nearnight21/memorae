import type { MemoryMapMarker } from './MemoraeMap.types';

export function materializeNativeMapThumbnail(_marker: MemoryMapMarker): string | undefined {
  return undefined;
}

export function pruneNativeMapThumbnailFiles(_activeCacheKeys: ReadonlySet<string>): void {}

export function resetNativeMapThumbnailFiles(): void {}
