/**
 * 地点显示与缓存层。
 *
 * 所有网络地点数据由服务端代理：高德负责中国地点，海外反查回退到
 * BigDataCloud。浏览器不直接访问第三方地点服务。
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
  province?: string;
  city?: string;
  /** 城市下一级行政区，用于地点的次级展示。 */
  district?: string;
  /** 反向地理编码返回的可读地点名。 */
  label?: string;
  placeName?: string;
  formattedAddress?: string;
  adcode?: string;
  provider?: 'amap' | 'bigdatacloud';
  providerId?: string;
}

export interface PlaceCandidate {
  displayName: string;
  shortName: string;
  lat: number;
  lng: number;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
  poiId?: string;
  provider?: 'amap';
  providerId?: string;
}

/**
 * Leaflet may retain the longitude of a copied world when users pan across
 * the antimeridian. Persist and send the canonical representation instead.
 */
export function normalizeLongitude(lng: number): number {
  if (!Number.isFinite(lng)) return lng;
  const normalized = ((lng + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 && lng > 0 ? 180 : normalized;
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

const CHINA_MUNICIPALITIES = new Set(['北京市', '上海市', '天津市', '重庆市']);

function textValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => textValue(item)).find(Boolean);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function addressAdministrativeFallback(address: string): Pick<GeoResult, 'province' | 'city' | 'district'> {
  const text = address.replace(/^(?:中国|中國)/, '');
  const provinceMatch = text.match(/^([\u4e00-\u9fa5]{2,}?(?:省|自治区|特别行政区|市))/);
  const province = provinceMatch?.[1];
  const remainder = province ? text.slice(province.length) : text;
  const isMunicipality = CHINA_MUNICIPALITIES.has(province ?? '');
  const city = isMunicipality
    ? province
    : remainder.match(/^([\u4e00-\u9fa5]{2,}(?:市|自治州|地区|盟))/)?.[1];
  const districtText = isMunicipality ? remainder : city ? remainder.slice(city.length) : remainder;
  const district = districtText.match(/^([\u4e00-\u9fa5]{2,}(?:区|县|旗))/)?.[1];
  return { province, city, district };
}

/**
 * Normalize both the current API shape and older cloud responses. Older
 * deployments returned a formatted address but omitted province/city, and
 * AMap can return city as an empty array for municipalities.
 */
export function normalizeGeoResult(result: GeoResult): GeoResult {
  const country = textValue(result.country);
  const addressFallback = country?.includes('中国') || country?.includes('中國')
    ? addressAdministrativeFallback(textValue(result.formattedAddress) ?? '')
    : {};
  const province = textValue(result.province) || addressFallback.province;
  const city = textValue(result.city)
    || (province && CHINA_MUNICIPALITIES.has(province) ? province : addressFallback.city);
  const district = textValue(result.district) || addressFallback.district;
  return { ...result, country, province, city, district };
}

export function hasResolvedAdministrativeLocation(
  result: Pick<GeoResult, 'country' | 'province' | 'city'> | null | undefined,
): boolean {
  if (!result) return false;
  const country = textValue(result.country) || '';
  const isChina = country.includes('中国') || country.includes('中國');
  return Boolean(textValue(result.city)) || (!isChina && Boolean(textValue(result.province)));
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
  return normalizeGeoResult({
    lat: result.lat,
    lng: result.lng,
    country: result.country,
    province: textValue(result.province),
    city: textValue(result.city),
    district: result.district,
    label: result.label,
    placeName: result.placeName ?? result.label,
    formattedAddress: result.formattedAddress,
    adcode: result.adcode,
    provider: result.provider ?? 'amap',
  });
}

function candidateFromAmap(result: LocationSearchResult): PlaceCandidate {
  return {
    displayName: result.displayName,
    shortName: result.shortName,
    lat: result.lat,
    lng: result.lng,
    country: result.country,
    province: result.province,
    city: result.city,
    district: result.district,
    adcode: result.adcode,
    poiId: result.poiId,
    provider: result.provider,
    providerId: result.providerId,
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
  const key = `amap_geocode_v2_${query.trim()}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return normalizeGeoResult(JSON.parse(cached) as GeoResult);
  } catch {
    // Ignore malformed local cache entries.
  }
  const candidate = (await searchPlaces(query))[0];
  if (!candidate) return null;
  const reverse = await reverseGeocodeCoordinates(candidate.lat, candidate.lng);
  const result = normalizeGeoResult({
    lat: candidate.lat,
    lng: candidate.lng,
    country: reverse?.country,
    province: reverse?.province,
    city: reverse?.city,
    district: reverse?.district,
    label: candidate.shortName || reverse?.label,
    placeName: candidate.shortName || reverse?.placeName || reverse?.label,
    formattedAddress: reverse?.formattedAddress ?? candidate.displayName,
    adcode: reverse?.adcode,
    provider: reverse?.provider,
    providerId: reverse?.providerId,
  });
  try {
    localStorage.setItem(key, JSON.stringify(result));
  } catch {
    // Cache is only an optimisation.
  }
  return result;
}

/** 地图点击和 GPS 反查：传入的坐标不在这里做二次搜索或移动。 */
export async function reverseGeocodeCoordinates(lat: number, lng: number): Promise<GeoResult | null> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng)) return null;
  const normalizedLng = normalizeLongitude(lng);
  const key = `location_reverse_v3_${lat.toFixed(5)}_${normalizedLng.toFixed(5)}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return normalizeGeoResult(JSON.parse(cached) as GeoResult);
  } catch {
    // Ignore malformed local cache entries.
  }

  const reverse = await reverseGeocodeWithAmap({ lat, lng: normalizedLng });
  if (!reverse) return null;
  const result = geoFromReverse(reverse);
  try {
    localStorage.setItem(key, JSON.stringify(result));
  } catch {
    // Cache is only an optimisation.
  }
  return result;
}

/** 候选搜索只确认名称和坐标；最终行政层级必须来自同一坐标的反向地理编码。 */
export async function resolvePlaceCandidate(candidate: PlaceCandidate): Promise<GeoResult | null> {
  const reverse = await reverseGeocodeCoordinates(candidate.lat, candidate.lng);
  if (!reverse) return null;
  return normalizeGeoResult({
    ...reverse,
    label: candidate.shortName || reverse.label,
    placeName: candidate.shortName || reverse.placeName || reverse.label,
    formattedAddress: reverse.formattedAddress || candidate.displayName,
    country: reverse.country,
    province: reverse.province,
    city: reverse.city,
    district: reverse.district,
    adcode: reverse.adcode,
    provider: reverse.provider,
    providerId: candidate.providerId,
  });
}

/** 高德输入提示 / POI 搜索的候选列表。 */
export async function searchPlaces(query: string, adcode?: string): Promise<PlaceCandidate[]> {
  const text = query.trim();
  if (!text) return [];
  const key = `amap_search_v2_${adcode ?? ''}_${text}`;
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
