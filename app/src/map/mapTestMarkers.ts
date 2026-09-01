import type { PhotoMapMarker } from '../../modules/expo-amap-map/src/ExpoAmapMap.types';

export interface ThumbnailSource {
  key: string;
  uri: string;
}

export const TEST_CITIES = {
  北京: { latitude: 39.9042, longitude: 116.4074, zoom: 10 },
  东京: { latitude: 35.6762, longitude: 139.6503, zoom: 10 },
  巴黎: { latitude: 48.8566, longitude: 2.3522, zoom: 10 },
  纽约: { latitude: 40.7128, longitude: -74.006, zoom: 10 },
} as const;

const CITY_ENTRIES = Object.entries(TEST_CITIES);

export function buildMapTestMarkers(
  count: 20 | 100,
  thumbnails: readonly ThumbnailSource[],
  selectedId: string | null,
): PhotoMapMarker[] {
  return Array.from({ length: count }, (_, index) => {
    const [city, center] = CITY_ENTRIES[index % CITY_ENTRIES.length];
    const ring = Math.floor(index / CITY_ENTRIES.length);
    const angle = index * 2.399963229728653;
    const radius = 0.015 + ring * 0.006;
    const thumbnail = thumbnails.length > 0
      ? thumbnails[index % thumbnails.length]
      : undefined;
    const id = `map-slice-${count}-${index}`;
    return {
      id,
      latitude: center.latitude + Math.sin(angle) * radius,
      longitude: center.longitude + Math.cos(angle) * radius,
      thumbnailKey: thumbnail?.key,
      thumbnailUri: thumbnail?.uri,
      selected: selectedId === id,
    };
  });
}
