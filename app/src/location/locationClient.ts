import { MemoryRecallSyncClient } from '../sync/syncClient';
import type { MemoryLocationV2 } from '../memory/memoryV2';

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationSuggestion extends LocationCoordinates {
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
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
}

export type LocationResult = LocationSuggestion | LocationReverseResult;

export type SelectedLocation = MemoryLocationV2;

export interface LocationClient {
  suggest(query: string, adcode?: string): Promise<LocationSuggestion[]>;
  reverse(coordinates: LocationCoordinates): Promise<LocationReverseResult | null>;
  convertGps(coordinates: LocationCoordinates): Promise<LocationCoordinates | null>;
}

export function normalizeLocationResult(
  result: LocationResult,
  previous?: Pick<MemoryLocationV2, 'mx' | 'my'> | null,
): SelectedLocation {
  const name = 'shortName' in result
    ? result.shortName
    : result.placeName ?? result.label ?? result.formattedAddress;
  if (!name?.trim()) throw new Error('地点服务没有返回可显示的地点名称。');
  const location: SelectedLocation = {
    name: name.trim(),
    mx: previous?.mx ?? 50,
    my: previous?.my ?? 50,
    lat: result.lat,
    lng: result.lng,
    provider: result.provider,
    ...(result.country ? { country: result.country } : {}),
    ...(result.province ? { province: result.province } : {}),
    ...(result.city ? { city: result.city } : {}),
    ...(result.district ? { district: result.district } : {}),
    ...(result.adcode ? { adcode: result.adcode } : {}),
    ...('providerId' in result && result.providerId ? { providerId: result.providerId } : {}),
    ...('formattedAddress' in result && result.formattedAddress ? { detail: result.formattedAddress } : {}),
  };
  return location;
}

export function locationRegionLabel(location: Partial<LocationResult> | null): string {
  if (!location) return '正在获取地点…';
  const value = location as Partial<LocationSuggestion & LocationReverseResult>;
  const parts = [location.province, location.city, location.district].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  ).filter((value, index, values) => values.indexOf(value) === index);
  return parts.join(' · ') || value.placeName || value.shortName || '已选择地点';
}

export function locationPlaceLabel(location: Partial<LocationResult> | null): string {
  if (!location) return '';
  const value = location as Partial<LocationSuggestion & LocationReverseResult>;
  return value.shortName || value.placeName || value.label || value.formattedAddress || '';
}

export class MobileLocationClient implements LocationClient {
  constructor(private readonly client: MemoryRecallSyncClient) {}

  suggest(query: string, adcode?: string): Promise<LocationSuggestion[]> {
    return this.client.suggestLocations(query, adcode);
  }

  reverse(coordinates: LocationCoordinates): Promise<LocationReverseResult | null> {
    return this.client.reverseLocation(coordinates);
  }

  convertGps(coordinates: LocationCoordinates): Promise<LocationCoordinates | null> {
    return this.client.convertGpsCoordinates(coordinates);
  }
}

export class LocalAmapLocationClient implements LocationClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl?.trim() || process.env.EXPO_PUBLIC_MEMORY_RECALL_API_URL?.trim() || 'https://memorae.cn';
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T | null> {
    try {
      const response = await fetch(`${this.baseUrl}${url}`, init);
      if (!response.ok) {
        console.warn('[location-client-error]', `HTTP ${response.status} from ${url}`);
        return null;
      }
      return await response.json() as T;
    } catch (error) {
      console.warn('[location-client-fetch-error]', error);
      return null;
    }
  }

  async suggest(query: string, _adcode?: string): Promise<LocationSuggestion[]> {
    const params = new URLSearchParams({ keywords: query.trim(), output: 'json' });
    const result = await this.request<LocationSuggestion[]>(`/v1/location/public/suggest?${new URLSearchParams({ q: query.trim() }).toString()}`,
    );
    return result ?? [];
  }

  async reverse(coordinates: LocationCoordinates): Promise<LocationReverseResult | null> {
    const params = new URLSearchParams({ lat: String(coordinates.lat), lng: String(coordinates.lng) });
    const result = await this.request<LocationReverseResult>(`/v1/location/public/reverse?${params.toString()}`,
    );
    return result;
  }

  async convertGps(coordinates: LocationCoordinates): Promise<LocationCoordinates | null> {
    const params = new URLSearchParams({ locations: `${coordinates.lng},${coordinates.lat}`, coordsys: 'gps', output: 'json' });
    return this.request<LocationCoordinates>('/v1/location/public/convert-gps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(coordinates) });
  }
}
