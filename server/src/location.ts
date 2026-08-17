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

export interface ReverseGeocodedLocation extends LocationCoordinates {
  label?: string;
  placeName?: string;
  formattedAddress?: string;
  provider: 'amap';
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
}

export interface LocationService {
  suggest(query: string, adcode?: string): Promise<LocationSuggestion[]>;
  reverse(coordinates: LocationCoordinates): Promise<ReverseGeocodedLocation | null>;
  convertGps(coordinates: LocationCoordinates): Promise<LocationCoordinates>;
}

export class LocationServiceUnavailableError extends Error {
  constructor() {
    super('地点服务尚未配置。');
    this.name = 'LocationServiceUnavailableError';
  }
}

export class LocationProviderError extends Error {
  constructor(message = '地点服务暂时不可用。') {
    super(message);
    this.name = 'LocationProviderError';
  }
}

interface AmapWebServiceOptions {
  key: string;
  fetch?: typeof fetch;
}

type AmapStatusResponse = {
  status?: string;
  info?: string;
  infocode?: string;
};

type AmapAddressComponent = {
  country?: string;
  province?: string;
  city?: string | string[];
  district?: string;
  adcode?: string;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cityValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.map(stringValue).find(Boolean);
  return stringValue(value);
}

const CHINA_MUNICIPALITIES = new Set(['北京市', '上海市', '天津市', '重庆市']);

function normalizedAdministrativeLocation(component: AmapAddressComponent): Pick<
  ReverseGeocodedLocation,
  'country' | 'province' | 'city' | 'district' | 'adcode'
> {
  const country = stringValue(component.country);
  const province = stringValue(component.province);
  const rawCity = cityValue(component.city);
  const isChina = country === '中国' || Boolean(province && CHINA_MUNICIPALITIES.has(province));
  const city = rawCity || (isChina && province && CHINA_MUNICIPALITIES.has(province) ? province : undefined);
  return {
    country,
    province,
    city,
    district: stringValue(component.district),
    adcode: stringValue(component.adcode),
  };
}

function requireCoordinates(value: string | undefined): LocationCoordinates {
  const [lngText, latText] = value?.split(',') ?? [];
  const lng = Number(lngText);
  const lat = Number(latText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new LocationProviderError('地点服务返回了无效坐标。');
  }
  return { lat, lng };
}

/**
 * 高德 Web 服务的最小封装。它只运行在服务端，浏览器永远拿不到 key。
 * 高德地点搜索、反查与坐标转换的返回坐标均按 GCJ-02 使用。
 */
export class AmapWebLocationService implements LocationService {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: AmapWebServiceOptions) {
    if (!options.key.trim()) throw new Error('高德 Web 服务 Key 不能为空。');
    this.fetcher = options.fetch ?? fetch;
  }

  async suggest(query: string, adcode?: string): Promise<LocationSuggestion[]> {
    const params = new URLSearchParams({
      key: this.options.key,
      keywords: query.trim(),
      citylimit: 'true',
      output: 'json',
    });
    if (adcode?.trim()) params.set('city', adcode.trim());
    const response = await this.request<AmapStatusResponse & {
      tips?: Array<{
        id?: string;
        name?: string;
        address?: string;
        location?: string;
        adcode?: string;
        district?: string;
      }>;
    }>('https://restapi.amap.com/v3/assistant/inputtips', params);

    return (response.tips ?? []).flatMap((tip) => {
      // AMap uses [] rather than omitting location for broad, non-POI suggestions.
      if (typeof tip.location !== 'string' || !tip.location.trim() || !tip.name) return [];
      const coordinates = requireCoordinates(tip.location);
      const district = stringValue(tip.district);
      const address = stringValue(tip.address);
      return [{
        ...coordinates,
        shortName: tip.name.trim(),
        displayName: [district, address].filter(Boolean).join(' · ') || tip.name.trim(),
        provider: 'amap' as const,
        providerId: stringValue(tip.id),
        district,
        adcode: stringValue(tip.adcode),
        poiId: stringValue(tip.id),
      }];
    });
  }

  async reverse(coordinates: LocationCoordinates): Promise<ReverseGeocodedLocation | null> {
    const params = new URLSearchParams({
      key: this.options.key,
      location: `${coordinates.lng},${coordinates.lat}`,
      extensions: 'all',
      output: 'json',
    });
    const response = await this.request<AmapStatusResponse & {
      regeocode?: {
        formatted_address?: string;
        addressComponent?: AmapAddressComponent;
        pois?: Array<{ name?: string }>;
      };
    }>('https://restapi.amap.com/v3/geocode/regeo', params);
    const result = response.regeocode;
    if (!result) return null;
    const component = result.addressComponent ?? {};
    const formattedAddress = stringValue(result.formatted_address);
    const label = stringValue(result.pois?.[0]?.name) ?? formattedAddress;
    return {
      ...coordinates,
      label,
      placeName: label,
      formattedAddress,
      provider: 'amap',
      ...normalizedAdministrativeLocation(component),
    };
  }

  async convertGps(coordinates: LocationCoordinates): Promise<LocationCoordinates> {
    const params = new URLSearchParams({
      key: this.options.key,
      locations: `${coordinates.lng},${coordinates.lat}`,
      coordsys: 'gps',
      output: 'json',
    });
    const response = await this.request<AmapStatusResponse & { locations?: string }>(
      'https://restapi.amap.com/v3/assistant/coordinate/convert',
      params,
    );
    return requireCoordinates(response.locations);
  }

  private async request<T extends AmapStatusResponse>(endpoint: string, params: URLSearchParams): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${endpoint}?${params.toString()}`);
    } catch {
      throw new LocationProviderError();
    }
    if (!response.ok) throw new LocationProviderError();
    let body: T;
    try {
      body = await response.json() as T;
    } catch {
      throw new LocationProviderError('地点服务返回无法解析。');
    }
    if (body.status !== '1') {
      throw new LocationProviderError(stringValue(body.info) ?? '地点服务暂时不可用。');
    }
    return body;
  }
}
