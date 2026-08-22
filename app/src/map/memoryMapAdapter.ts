import type { MemoryV2 } from '../memory/memoryV2';
import type { AmapWebViewMarker } from './AmapJsWebViewMap';

/** Exposes only the public location projection that the map UI needs. */
export function memoriesToMapMarkers(memories: readonly MemoryV2[]): AmapWebViewMarker[] {
  return memories.flatMap((memory) => {
    const location = memory.location;
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return [];
    return [{ id: memory.id, lat: location.lat!, lng: location.lng! }];
  });
}

export function findMemoryForMarker(
  memories: readonly MemoryV2[],
  markerId: string,
): MemoryV2 | null {
  return memories.find((memory) => memory.id === markerId) ?? null;
}
