import type { MemoryV2 } from '../memory/memoryV2';
import type { CameraState, MapBounds, MapCameraIdleEvent } from './MemoraeMap.types';

export const HOME_CHINA_CAMERA = { latitude: 35.8617, longitude: 104.1954, zoom: 4 } as const;
export const HOME_MAP_MIN_ZOOM = 4;
export const HOME_MAP_MAX_ZOOM = 14;
export const HOME_PROVINCE_ZOOM = 6;
export const HOME_POINT_ZOOM = 9;

export type HomeRegionScope = 'country' | 'province' | 'city';

export interface HomeRegionOption {
  key: string;
  label: string;
  scope: HomeRegionScope;
  country: string;
  province?: string;
  city?: string;
  memoryCount: number;
  camera: CameraState;
}

interface LocatedMemory {
  lat: number;
  lng: number;
  country: string;
  province?: string;
  city?: string;
}

function clean(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function countryFor(memory: MemoryV2): string | undefined {
  const location = memory.location;
  const country = clean(location?.country);
  if (country && /^(中国|中华人民共和国|China|CN)$/i.test(country)) return '中国';
  if (country) return country;
  return clean(location?.province) || clean(location?.city) ? '中国' : undefined;
}

function locatedMemories(memories: readonly MemoryV2[]): LocatedMemory[] {
  return memories.flatMap((memory) => {
    const location = memory.location;
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return [];
    const country = countryFor(memory);
    if (!country) return [];
    return [{
      lat: location.lat!,
      lng: location.lng!,
      country,
      province: clean(location.province),
      city: clean(location.city),
    }];
  });
}

function shortAdministrativeName(value: string): string {
  return value.replace(/(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$/u, '');
}

function averageCamera(items: readonly LocatedMemory[], zoom: number): HomeRegionOption['camera'] {
  if (items.length === 0) return { ...HOME_CHINA_CAMERA, zoom };
  return {
    latitude: items.reduce((sum, item) => sum + item.lat, 0) / items.length,
    longitude: items.reduce((sum, item) => sum + item.lng, 0) / items.length,
    zoom,
  };
}

function groupBy<T>(items: readonly T[], keyFor: (item: T) => string | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

export function buildHomeRegionOptions(memories: readonly MemoryV2[]): HomeRegionOption[] {
  const located = locatedMemories(memories);
  const chinese = located.filter((item) => item.country === '中国');
  const options: HomeRegionOption[] = [{
    key: 'country:中国',
    label: '中国',
    scope: 'country',
    country: '中国',
    memoryCount: chinese.length,
    camera: { ...HOME_CHINA_CAMERA },
  }];

  for (const [country, items] of groupBy(located.filter((item) => item.country !== '中国'), (item) => item.country)) {
    options.push({
      key: `country:${country}`,
      label: country,
      scope: 'country',
      country,
      memoryCount: items.length,
      camera: averageCamera(items, HOME_PROVINCE_ZOOM),
    });
  }

  for (const [province, items] of groupBy(chinese, (item) => item.province)) {
    const provinceLabel = shortAdministrativeName(province);
    options.push({
      key: `province:中国:${province}`,
      label: provinceLabel,
      scope: 'province',
      country: '中国',
      province,
      memoryCount: items.length,
      camera: averageCamera(items, HOME_PROVINCE_ZOOM),
    });

    for (const [city, cityItems] of groupBy(items, (item) => item.city)) {
      options.push({
        key: `city:中国:${province}:${city}`,
        label: `${provinceLabel} · ${shortAdministrativeName(city)}`,
        scope: 'city',
        country: '中国',
        province,
        city,
        memoryCount: cityItems.length,
        camera: averageCamera(cityItems, HOME_POINT_ZOOM),
      });
    }
  }

  return options.sort((left, right) => {
    if (left.key === 'country:中国') return -1;
    if (right.key === 'country:中国') return 1;
    const rank: Record<HomeRegionScope, number> = { country: 0, province: 1, city: 2 };
    return rank[left.scope] - rank[right.scope]
      || left.country.localeCompare(right.country, 'zh-CN')
      || (left.province ?? '').localeCompare(right.province ?? '', 'zh-CN')
      || (left.city ?? '').localeCompare(right.city ?? '', 'zh-CN');
  });
}

function withinBounds(item: LocatedMemory, bounds: MapBounds | undefined): boolean {
  if (!bounds) return true;
  const withinLatitude = item.lat >= bounds.southWest.latitude
    && item.lat <= bounds.northEast.latitude;
  const withinLongitude = bounds.southWest.longitude <= bounds.northEast.longitude
    ? item.lng >= bounds.southWest.longitude && item.lng <= bounds.northEast.longitude
    : item.lng >= bounds.southWest.longitude || item.lng <= bounds.northEast.longitude;
  return withinLatitude && withinLongitude;
}

function unique(items: readonly string[]): string[] {
  return Array.from(new Set(items));
}

export function currentHomeRegionLabel(
  viewport: MapCameraIdleEvent,
  memories: readonly MemoryV2[],
): string {
  const zoom = viewport.camera.zoom;
  if (!viewport.bounds && zoom <= HOME_CHINA_CAMERA.zoom) return '中国';
  const visible = locatedMemories(memories).filter((item) => withinBounds(item, viewport.bounds));
  if (visible.length === 0) return '中国';

  const countries = unique(visible.map((item) => item.country));
  if (zoom < HOME_PROVINCE_ZOOM || countries.length !== 1) {
    return countries.length === 1 ? countries[0] : '中国';
  }

  const country = countries[0];
  if (country !== '中国') return country;
  const provinces = unique(visible.map((item) => item.province).filter((value): value is string => Boolean(value)));
  if (zoom < HOME_POINT_ZOOM || provinces.length !== 1) {
    return provinces.length === 1 ? shortAdministrativeName(provinces[0]) : '中国';
  }

  const province = provinces[0];
  const cities = unique(visible
    .filter((item) => item.province === province)
    .map((item) => item.city)
    .filter((value): value is string => Boolean(value)));
  return cities.length === 1
    ? `${shortAdministrativeName(province)} · ${shortAdministrativeName(cities[0])}`
    : shortAdministrativeName(province);
}
