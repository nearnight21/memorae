import type { MemoryV2 } from '../memory/memoryV2';
import type { AmapWebViewMarker } from './AmapJsWebViewMap';

export type MemoryThumbnailRefs = Readonly<Record<string, readonly string[]>>;

/** Exposes only the public location projection that the map UI needs. */
export function memoriesToMapMarkers(
  memories: readonly MemoryV2[],
  thumbnailRefs?: MemoryThumbnailRefs,
): AmapWebViewMarker[] {
  return memories.flatMap((memory) => {
    const location = memory.location;
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return [];
    const base = { id: memory.id, lat: location.lat!, lng: location.lng! };
    if (!thumbnailRefs) return [base];
    const refs = thumbnailRefs[memory.id] ?? [];
    return [{
      ...base,
      photoCount: memory.photos.length,
      thumbnailRefs: refs.slice(0, 3),
      scale: Math.min(1.2, 0.82 + Math.min(memory.photos.length, 3) * 0.11),
    }];
  });
}

export function findMemoryForMarker(
  memories: readonly MemoryV2[],
  markerId: string,
): MemoryV2 | null {
  return memories.find((memory) => memory.id === markerId) ?? null;
}
