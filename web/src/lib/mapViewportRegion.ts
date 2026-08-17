export type ViewportRegionScope = 'country' | 'province' | 'city';

export interface ViewportRegion {
  name: string;
  scope: ViewportRegionScope;
  country: string;
}

export interface ViewportRegionCandidate {
  country: string;
  province?: string;
  city?: string;
  lat: number;
  lng: number;
}

export interface GeographicBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export const COUNTRY_VIEWPORT_ZOOM = 5;
export const CITY_VIEWPORT_ZOOM = 8;

// Keep a small fallback table for viewport-level province grouping. Normalized
// MemoryV2 records also carry province, but the viewport candidate contract
// intentionally stays compact and derives it from the city label here.
const CHINA_CITY_PROVINCES: Record<string, string> = {
  '宁波': '浙江',
  '杭州': '浙江',
  '温州': '浙江',
  '绍兴': '浙江',
  '嘉兴': '浙江',
  '湖州': '浙江',
  '金华': '浙江',
  '台州': '浙江',
  '衢州': '浙江',
  '丽水': '浙江',
  '西安': '陕西',
  '北京': '北京',
  '上海': '上海',
  '成都': '四川',
  '广州': '广东',
  '深圳': '广东',
  '大理': '云南',
};

export const provinceForCity = (country: string, city?: string): string | null => {
  if (!city || country !== '中国') return null;
  const normalizedCity = city.trim().replace(/市$/, '');
  return CHINA_CITY_PROVINCES[normalizedCity] ?? null;
};

const contains = (bounds: GeographicBounds, candidate: ViewportRegionCandidate): boolean =>
  candidate.lat >= bounds.south && candidate.lat <= bounds.north &&
  candidate.lng >= bounds.west && candidate.lng <= bounds.east;

const distinct = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const distanceFromBoundsCenter = (bounds: GeographicBounds, candidate: ViewportRegionCandidate): number => {
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const lngScale = Math.cos((centerLat * Math.PI) / 180) || 0.5;
  return Math.hypot(candidate.lat - centerLat, (candidate.lng - centerLng) * lngScale);
};

/**
 * Derives the one shared current-region state from a settled map viewport.
 * Wide views deliberately stay global; city-scale views can fall back to a
 * common province when more than one city is visible.
 */
export const currentRegionForViewport = (
  zoom: number,
  bounds: GeographicBounds,
  candidates: ViewportRegionCandidate[],
): ViewportRegion | null => {
  if (zoom < COUNTRY_VIEWPORT_ZOOM) return null;

  const visible = candidates.filter((candidate) => contains(bounds, candidate));
  const countries = distinct(visible.map((candidate) => candidate.country));
  if (countries.length !== 1) return null;

  const country = countries[0];
  if (zoom < CITY_VIEWPORT_ZOOM) return { name: country, scope: 'country', country };

  const cities = distinct(visible.map((candidate) => candidate.city?.trim() ?? ''));
  if (cities.length === 1) return { name: cities[0], scope: 'city', country };
  if (cities.length === 0) return { name: country, scope: 'country', country };

  // At a true city zoom the map can still include a neighbouring city on a
  // wide desktop. When the viewport center is clearly on one city, preserve
  // that city instead of bouncing to its province.
  if (zoom >= CITY_VIEWPORT_ZOOM + 1) {
    const nearest = visible
      .filter((candidate) => candidate.city?.trim())
      .map((candidate) => ({ candidate, distance: distanceFromBoundsCenter(bounds, candidate) }))
      .sort((left, right) => left.distance - right.distance);
    if (nearest.length === 1 || nearest[0].distance < nearest[1].distance * 0.48) {
      return { name: nearest[0].candidate.city!.trim(), scope: 'city', country };
    }
  }

  const provinces = distinct(visible
    .filter((candidate) => candidate.city?.trim())
    .map((candidate) => candidate.province?.trim() || provinceForCity(country, candidate.city) || ''));
  if (provinces.length === 1) return { name: provinces[0], scope: 'province', country };
  return { name: country, scope: 'country', country };
};
