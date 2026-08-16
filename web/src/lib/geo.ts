/**
 * 地点显示与缓存层。
 *
 * 所有网络地点数据由服务端代理高德服务返回。浏览器不再访问 Nominatim，
 * 这样搜索、地图落点和照片 GPS 会在同一套 GCJ-02 坐标中工作。
 */
import {
  reverseGeocodeWithAmap,
  searchAmapPlaces,
  type LocationReverseResult,
  type LocationSearchResult,
} from './locationApi';

type LatLng = [number, number];

/** 仅保留不需要请求服务的海外概览坐标。中国地点统一交给高德解析。 */
const PRESET_PLACES: Record<string, LatLng> = {
  '日本': [36.2048, 138.2529],
  '韩国': [36.5, 127.9],
  '泰国': [15.87, 100.9925],
  '越南': [14.0583, 108.2772],
  '美国': [37.0902, -95.7129],
  '加拿大': [56.1304, -106.3468],
  '英国': [55.3781, -3.436],
  '法国': [46.2276, 2.2137],
  '德国': [51.1657, 10.4515],
  '意大利': [41.8719, 12.5674],
  '西班牙': [40.4637, -3.7492],
  '澳大利亚': [-25.2744, 133.7751],
  '新西兰': [-40.9006, 174.886],
  '日本/东京': [35.6762, 139.6503],
  '日本/山梨': [35.6642, 138.5684],
  '日本/京都': [35.0116, 135.7681],
  '日本/千叶': [35.6074, 140.1065],
  '日本/长野': [36.6513, 138.181],
  '日本/大阪': [34.6937, 135.5023],
  '日本/北海道': [43.0642, 141.3469],
  '日本/冲绳': [26.2124, 127.6809],
};

const cacheKey = (country: string, city?: string) =>
  `amap_place_v1_${country}${city ? `/${city}` : ''}`;

const resolvedPlaceCache = new Map<string, LatLng | null>();
const pendingPlaceRequests = new Map<string, Promise<LatLng | null>>();

export interface GeoResult {
  lat: number;
  lng: number;
  country?: string;
  city?: string;
  /** 城市下一级行政区，用于地点的次级展示。 */
  district?: string;
  /** 反向地理编码返回的可读地点名。 */
  label?: string;
  formattedAddress?: string;
  adcode?: string;
}

export interface PlaceCandidate {
  displayName: string;
  shortName: string;
  lat: number;
  lng: number;
  country?: string;
  city?: string;
  district?: string;
  adcode?: string;
  poiId?: string;
}

type GeoAddress = {
  country?: string;
  city?: string;
  city_district?: string;
  district?: string;
  borough?: string;
  suburb?: string;
  town?: string;
  municipality?: string;
  village?: string;
  county?: string;
  state?: string;
};

function displayNameParts(displayName?: string): string[] {
  return displayName?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];
}

/** 保持中国城市为地图主层级，区县只作地点次级信息。 */
export function administrativeLocation(address: GeoAddress, displayName?: string): {
  city?: string;
  district?: string;
} {
  const parts = displayNameParts(displayName);
  const cityFromDisplayName = parts.find((part) => /.+市$/.test(part));
  const city = cityFromDisplayName
    ? cityFromDisplayName.replace(/市$/, '')
    : address.city || address.town || address.municipality || address.state || address.county || address.village;
  const districtFromDisplayName = parts.find((part) => /.+(?:区|县|旗)$/.test(part) && part !== cityFromDisplayName);
  const district = address.city_district || address.district || address.borough || address.suburb
    || districtFromDisplayName || (city !== address.city ? address.city : undefined);
  return { city, district };
}

function geoFromReverse(result: LocationReverseResult): GeoResult {
  return {
    lat: result.lat,
    lng: result.lng,
    country: result.country,
    city: result.city,
    district: result.district,
    label: result.label,
    formattedAddress: result.formattedAddress,
    adcode: result.adcode,
  };
}

function candidateFromAmap(result: LocationSearchResult): PlaceCandidate {
  return {
    displayName: result.displayName,
    shortName: result.shortName,
    lat: result.lat,
    lng: result.lng,
    country: result.country,
    city: result.city,
    district: result.district,
    adcode: result.adcode,
    poiId: result.poiId,
  };
}

/** 解析国家或城市用于旧记忆的显示回退。 */
export async function resolvePlace(country: string, city?: string): Promise<LatLng | null> {
  const presetKey = city ? `${country}/${city}` : country;
  if (PRESET_PLACES[presetKey]) return PRESET_PLACES[presetKey];

  const key = cacheKey(country, city);
  if (resolvedPlaceCache.has(key)) return resolvedPlaceCache.get(key) ?? null;
  const pending = pendingPlaceRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const [lat, lng] = JSON.parse(cached) as LatLng;
        if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng] as LatLng;
      }
    } catch {
      // Ignore malformed local cache entries.
    }

    const result = await geocodeAddress(city ? `${city} ${country}` : country);
    if (!result) return null;
    const coordinates: LatLng = [result.lat, result.lng];
    try {
      localStorage.setItem(key, JSON.stringify(coordinates));
    } catch {
      // Cache is only an optimisation.
    }
    return coordinates;
  })();
  pendingPlaceRequests.set(key, request);
  try {
    const result = await request;
    resolvedPlaceCache.set(key, result);
    return result;
  } finally {
    pendingPlaceRequests.delete(key);
  }
}

/** 根据一个文本地点补齐显示层级；坐标始终来自高德搜索候选。 */
export async function geocodeAddress(query: string): Promise<GeoResult | null> {
  const key = `amap_geocode_v1_${query.trim()}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached) as GeoResult;
  } catch {
    // Ignore malformed local cache entries.
  }
  const candidate = (await searchPlaces(query))[0];
  if (!candidate) return null;
  const result: GeoResult = {
    lat: candidate.lat,
    lng: candidate.lng,
    country: candidate.country,
    city: candidate.city,
    district: candidate.district,
    label: candidate.shortName,
    adcode: candidate.adcode,
  };
  try {
    localStorage.setItem(key, JSON.stringify(result));
  } catch {
    // Cache is only an optimisation.
  }
  return result;
}

/** 地图点击和 GPS 反查：传入的坐标不在这里做二次搜索或移动。 */
export async function reverseGeocodeCoordinates(lat: number, lng: number): Promise<GeoResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `amap_reverse_v1_${lat.toFixed(5)}_${lng.toFixed(5)}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached) as GeoResult;
  } catch {
    // Ignore malformed local cache entries.
  }

  const reverse = await reverseGeocodeWithAmap({ lat, lng });
  if (!reverse) return null;
  const result = geoFromReverse(reverse);
  try {
    localStorage.setItem(key, JSON.stringify(result));
  } catch {
    // Cache is only an optimisation.
  }
  return result;
}

/** 高德输入提示 / POI 搜索的候选列表。 */
export async function searchPlaces(query: string, adcode?: string): Promise<PlaceCandidate[]> {
  const text = query.trim();
  if (!text) return [];
  const key = `amap_search_v1_${adcode ?? ''}_${text}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached) as PlaceCandidate[];
  } catch {
    // Ignore malformed local cache entries.
  }
  const results = (await searchAmapPlaces(text, adcode)).map(candidateFromAmap);
  try {
    localStorage.setItem(key, JSON.stringify(results));
  } catch {
    // Cache is only an optimisation.
  }
  return results;
}
