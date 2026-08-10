/**
 * 地区线坐标解析层
 * ----------------
 * 坐标不入库：显示时先查预置表，未命中则调 Nominatim（OSM 免费地理编码），
 * 结果缓存到 localStorage，避免重复请求。
 */

type LatLng = [number, number];

/** 预置坐标：国家 → [lat,lng]；"国家/城市" → [lat,lng] */
const PRESET_PLACES: Record<string, LatLng> = {
  // ---- 国家（首都/地理中心）----
  '日本': [36.2048, 138.2529],
  '中国': [35.8617, 104.1954],
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

  // ---- 城市（示例数据 + 常见目的地）----
  '日本/东京': [35.6762, 139.6503],
  '日本/山梨': [35.6642, 138.5684],
  '日本/京都': [35.0116, 135.7681],
  '日本/千叶': [35.6074, 140.1065],
  '日本/长野': [36.6513, 138.181],
  '日本/大阪': [34.6937, 135.5023],
  '日本/北海道': [43.0642, 141.3469],
  '日本/冲绳': [26.2124, 127.6809],
  '中国/北京': [39.9042, 116.4074],
  '中国/上海': [31.2304, 121.4737],
  '中国/杭州': [30.2741, 120.1551],
  '中国/成都': [30.5728, 104.0668],
  '中国/大理': [25.6065, 100.2676],
  '中国/广州': [23.1291, 113.2644],
  '中国/深圳': [22.5431, 114.0579],
  '中国/西安': [34.3416, 108.9398],
};

const cacheKey = (country: string, city?: string) =>
  `geo_${country}${city ? `/${city}` : ''}`;

// 页面生命周期内的内存缓存和进行中的请求缓存，避免地图重建时重复访问地理编码服务。
const resolvedPlaceCache = new Map<string, LatLng | null>();
const pendingPlaceRequests = new Map<string, Promise<LatLng | null>>();

/**
 * 解析 国家 / 国家+城市 的坐标。
 * 顺序：预置表 → localStorage 缓存 → Nominatim 查询（并写入缓存）。
 * 失败返回 null（调用方跳过该气泡）。
 */
export async function resolvePlace(country: string, city?: string): Promise<LatLng | null> {
  const presetKey = city ? `${country}/${city}` : country;
  if (PRESET_PLACES[presetKey]) return PRESET_PLACES[presetKey];

  const ck = cacheKey(country, city);
  if (resolvedPlaceCache.has(ck)) return resolvedPlaceCache.get(ck) ?? null;
  const pending = pendingPlaceRequests.get(ck);
  if (pending) return pending;

  const request = resolvePlaceFromNetwork(country, city, ck);
  pendingPlaceRequests.set(ck, request);
  try {
    const result = await request;
    resolvedPlaceCache.set(ck, result);
    return result;
  } finally {
    pendingPlaceRequests.delete(ck);
  }
}

async function resolvePlaceFromNetwork(country: string, city: string | undefined, ck: string): Promise<LatLng | null> {
  try {
    const cached = localStorage.getItem(ck);
    if (cached) {
      const [lat, lng] = JSON.parse(cached) as LatLng;
      if (typeof lat === 'number' && typeof lng === 'number') return [lat, lng];
    }
  } catch {
    /* ignore cache errors */
  }

  try {
    const q = city ? `${city}, ${country}` : country;
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
    );
    const data = (await resp.json()) as Array<{ lat: string; lon: string }>;
    if (Array.isArray(data) && data.length > 0) {
      const coords: LatLng = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      try {
        localStorage.setItem(ck, JSON.stringify(coords));
      } catch {
        /* ignore cache errors */
      }
      return coords;
    }
  } catch {
    /* network / parse errors -> null */
  }
  return null;
}

export interface GeoResult {
  lat: number;
  lng: number;
  country?: string;
  city?: string;
}

/**
 * 地理编码任意地点名（如 "大理古城"），返回坐标及其所属国家/城市。
 * 用于：只填了「地点」没填「国家/城市」的记忆，自动归组到地图气泡。
 * accept-language=zh 保证返回中文地名，与用户手写的国家/城市分组键一致。
 */
export async function geocodeAddress(query: string): Promise<GeoResult | null> {
  const ck = `geocode_${query}`;
  try {
    const cached = localStorage.getItem(ck);
    if (cached) return JSON.parse(cached) as GeoResult;
  } catch {
    /* ignore cache errors */
  }

  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&accept-language=zh`
    );
    const data = (await resp.json()) as Array<{
      lat: string;
      lon: string;
      address?: {
        country?: string;
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        state?: string;
      };
    }>;
    if (Array.isArray(data) && data.length > 0) {
      const r = data[0];
      const addr = r.address || {};
      const result: GeoResult = {
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        country: addr.country,
        city: addr.city || addr.town || addr.village || addr.county || addr.state,
      };
      try {
        localStorage.setItem(ck, JSON.stringify(result));
      } catch {
        /* ignore cache errors */
      }
      return result;
    }
  } catch {
    /* network / parse errors -> null */
  }
  return null;
}

export interface PlaceCandidate {
  /** 完整地址描述（如 "大理古城, 大理市, 云南省, 中国"） */
  displayName: string;
  /** 地点短名（用于填入 location_name） */
  shortName: string;
  lat: number;
  lng: number;
  country?: string;
  city?: string;
}

/**
 * Nominatim 候选搜索：供 LocationPicker 下拉选择。
 * accept-language=zh 保证中文地名，与分组键一致。
 */
export async function searchPlaces(query: string): Promise<PlaceCandidate[]> {
  if (!query.trim()) return [];
  // 结果缓存：相同关键词不重复请求（Nominatim 境外，减少往返）
  const ck = `search_${query.trim()}`;
  try {
    const cached = localStorage.getItem(ck);
    if (cached) return JSON.parse(cached) as PlaceCandidate[];
  } catch {
    /* ignore cache errors */
  }
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1&accept-language=zh`
    );
    const data = (await resp.json()) as Array<{
      display_name: string;
      name?: string;
      lat: string;
      lon: string;
      address?: {
        country?: string;
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        state?: string;
      };
    }>;
    const results: PlaceCandidate[] = data.map((r) => ({
      displayName: r.display_name,
      shortName: r.name || r.display_name.split(',')[0],
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      country: r.address?.country,
      city:
        r.address?.city ||
        r.address?.town ||
        r.address?.village ||
        r.address?.county ||
        r.address?.state,
    }));
    try {
      localStorage.setItem(ck, JSON.stringify(results));
    } catch {
      /* ignore cache errors */
    }
    return results;
  } catch {
    return [];
  }
}
