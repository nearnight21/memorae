import type { MemoryV2 } from '../memory/memoryV2';
import type { MemoryMapMarker, MemoryMapThumbnail } from './MemoraeMap.types';

export type MemoryThumbnailSources = Readonly<Record<string, readonly MemoryMapThumbnail[]>>;

function validThumbnail(source: MemoryMapThumbnail | undefined): source is MemoryMapThumbnail {
  return Boolean(
    source
    && source.uri.trim().length > 0
    && !source.uri.trimStart().toLowerCase().startsWith('data:')
    && source.cacheKey.trim().length > 0,
  );
}

/** Exposes only the public location projection that the map UI needs. */
export function memoriesToMapMarkers(
  memories: readonly MemoryV2[],
  thumbnailSources?: MemoryThumbnailSources,
): MemoryMapMarker[] {
  return memories.flatMap((memory) => {
    const location = memory.location;
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return [];
    const region = {
      ...(location.country ? { country: location.country } : {}),
      ...(location.province ? { province: location.province } : {}),
      ...(location.city ? { city: location.city } : {}),
    };
    const base = {
      id: memory.id,
      latitude: location.lat!,
      longitude: location.lng!,
      ...(Object.keys(region).length > 0 ? { region } : {}),
    };
    if (!thumbnailSources) return [base];
    const source = (thumbnailSources[memory.id] ?? []).find(validThumbnail);
    return [{
      ...base,
      ...(source ? { thumbnail: source } : {}),
    }];
  });
}

export function findMemoryForMarker(
  memories: readonly MemoryV2[],
  markerId: string,
): MemoryV2 | null {
  return memories.find((memory) => memory.id === markerId) ?? null;
}
