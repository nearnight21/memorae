import { getStoredAccountSession } from '../prototype/storage';
import { isAccountSessionActive } from '../sync/accountSession';
import { MEMORY_RECALL_API_URL } from '../sync/config';

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationSearchResult extends LocationCoordinates {
  shortName: string;
  displayName: string;
  provider: 'amap';
  providerId?: string;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
  poiId?: string;
}

export interface LocationReverseResult extends LocationCoordinates {
  label?: string;
  placeName?: string;
  formattedAddress?: string;
  provider: 'amap' | 'bigdatacloud';
  country?: string;
  province?: string | string[];
  city?: string | string[];
  district?: string;
  adcode?: string;
}

/**
 * 地点请求必须经由所忆服务端：浏览器只发送当前账号令牌，不直接持有或调用地点服务。
 * 未配置在线服务时返回空结果。
 */
async function requestLocation<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  if (!MEMORY_RECALL_API_URL) return null;
  const session = await getStoredAccountSession();
  if (!session || !isAccountSessionActive(session)) return null;

  let response: Response;
  try {
    response = await fetch(`${MEMORY_RECALL_API_URL}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${session.accessToken}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

export async function searchAmapPlaces(query: string, adcode?: string): Promise<LocationSearchResult[]> {
  const text = query.trim();
  if (!text) return [];
  const params = new URLSearchParams({ q: text });
  if (adcode?.trim()) params.set('adcode', adcode.trim());
  return await requestLocation<LocationSearchResult[]>(`/v1/location/suggest?${params.toString()}`) ?? [];
}

export async function reverseGeocodeWithAmap(
  coordinates: LocationCoordinates,
): Promise<LocationReverseResult | null> {
  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return null;
  const params = new URLSearchParams({
    lat: String(coordinates.lat),
    lng: String(coordinates.lng),
  });
  return requestLocation<LocationReverseResult>(`/v1/location/reverse?${params.toString()}`);
}

/** Converts EXIF's WGS-84 GPS to the GCJ-02 coordinates used by the map. */
export async function convertGpsToAmap(
  coordinates: LocationCoordinates,
): Promise<LocationCoordinates | null> {
  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return null;
  return requestLocation<LocationCoordinates>('/v1/location/convert-gps', {
    method: 'POST',
    body: JSON.stringify(coordinates),
  });
}
