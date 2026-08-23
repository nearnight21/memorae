import type {
  EncryptedMemoryV1,
  EncryptedPhotoV1,
  PhotoKind,
  SealedBytesV1,
  VaultEnvelopeV1,
} from '../crypto';
import { utf8 } from '../crypto';

export interface LocationSuggestionResponse {
  lat: number;
  lng: number;
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

export interface LocationReverseResponse {
  lat: number;
  lng: number;
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

export interface SyncClientOptions {
  baseUrl: string;
  token: string;
  sha256Hex?: (value: string) => Promise<string>;
}

export interface SyncLoginCredentials {
  loginName: string;
  password: string;
  deviceId?: string;
}

export interface SyncLoginSession {
  accessToken: string;
  expiresAt: string;
}

interface PhotoUploadGrant {
  status: 'upload';
  uploadId: string;
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

interface PhotoUploadAlreadyComplete {
  status: 'complete';
}

interface PhotoDownloadGrant {
  id: string;
  kind: PhotoKind;
  cryptoVersion: 1;
  metadata: SealedBytesV1;
  contentLength: number;
  contentSha256: string | null;
  method: 'GET';
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

function validateObjectRequest(url: string, headers: Record<string, string>): void {
  const parsed = new URL(url);
  const localHttpHosts = new Set(['127.0.0.1', 'localhost', '10.0.2.2', '[::1]']);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localHttpHosts.has(parsed.hostname))) {
    throw new Error('照片对象地址必须使用 HTTPS。');
  }
  const names = Object.keys(headers).map((name) => name.toLowerCase());
  if (names.some((name) => name === 'authorization' || name === 'cookie' || name === 'proxy-authorization')) {
    throw new Error('照片对象授权包含不允许转发的会话请求头。');
  }
}

export class SyncRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

export class DirectPhotoTransferUnavailableError extends Error {
  constructor() {
    super('服务端尚未启用照片直传。');
    this.name = 'DirectPhotoTransferUnavailableError';
  }
}

export class PhotoVariantNotFoundError extends Error {
  constructor() {
    super('服务端没有该档照片密文。');
    this.name = 'PhotoVariantNotFoundError';
  }
}

export async function loginSyncSession(
  baseUrl: string,
  credentials: SyncLoginCredentials,
): Promise<SyncLoginSession> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new Error('暂时无法连接所忆，请检查网络后重试。');
  }
  if (!response.ok) {
    let serverMessage = '';
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === 'string') serverMessage = body.error.trim();
    } catch {
      // Some gateways return an empty or non-JSON error body.
    }
    if (response.status === 401) {
      throw new SyncRequestError(response.status, serverMessage || '账号或密码不正确。');
    }
    throw new SyncRequestError(
      response.status,
      serverMessage || `登录暂时不可用（HTTP ${response.status}）。`,
    );
  }
  return response.json() as Promise<SyncLoginSession>;
}

export class MemoryRecallSyncClient {
  private readonly baseUrl: string;
  private readonly sha256Hex: (value: string) => Promise<string>;

  constructor(private readonly options: SyncClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.sha256Hex = options.sha256Hex ?? (async (value) => {
      const Crypto = await import('expo-crypto');
      return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${this.options.token}`);
    if (init.body) headers.set('content-type', 'application/json');
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new SyncRequestError(response.status, `密文同步请求失败：HTTP ${response.status}。`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  putVault(vault: VaultEnvelopeV1): Promise<void> {
    return this.request('/v1/vault', { method: 'PUT', body: JSON.stringify(vault) });
  }

  getVault(): Promise<VaultEnvelopeV1> {
    return this.request('/v1/vault');
  }

  putMemory(memory: EncryptedMemoryV1): Promise<void> {
    return this.request(`/v1/memories/${encodeURIComponent(memory.id)}`, {
      method: 'PUT',
      body: JSON.stringify(memory),
    });
  }

  async listMemories(): Promise<EncryptedMemoryV1[]> {
    const response = await this.request<{ items: EncryptedMemoryV1[] }>('/v1/memories');
    return response.items;
  }

  async suggestLocations(query: string, adcode?: string): Promise<LocationSuggestionResponse[]> {
    const params = new URLSearchParams({ q: query.trim() });
    if (adcode?.trim()) params.set('adcode', adcode.trim());
    return this.request(`/v1/location/suggest?${params.toString()}`);
  }

  reverseLocation(coordinates: { lat: number; lng: number }): Promise<LocationReverseResponse | null> {
    const params = new URLSearchParams({
      lat: String(coordinates.lat),
      lng: String(coordinates.lng),
    });
    return this.request(`/v1/location/reverse?${params.toString()}`);
  }

  putPhoto(photo: EncryptedPhotoV1): Promise<void> {
    return this.request(`/v1/photos/${encodeURIComponent(photo.id)}`, {
      method: 'PUT',
      body: JSON.stringify(photo),
    });
  }

  async putPhotoVariant(photo: EncryptedPhotoV1): Promise<void> {
    const serializedContent = JSON.stringify(photo.content);
    const contentSha256 = await this.sha256Hex(serializedContent);
    let grant: PhotoUploadGrant | PhotoUploadAlreadyComplete;
    try {
      grant = await this.request(
        `/v1/photos/${encodeURIComponent(photo.id)}/${photo.kind}/upload`,
        {
          method: 'POST',
          body: JSON.stringify({
            cryptoVersion: photo.cryptoVersion,
            metadata: photo.metadata,
            contentLength: utf8(serializedContent).byteLength,
            contentSha256,
          }),
        },
      );
    } catch (error) {
      if (error instanceof SyncRequestError && error.status === 404) {
        throw new DirectPhotoTransferUnavailableError();
      }
      throw error;
    }
    if (grant.status === 'complete') return;
    validateObjectRequest(grant.url, grant.headers);

    const upload = await fetch(grant.url, {
      method: grant.method,
      headers: grant.headers,
      body: serializedContent,
    });
    if (!upload.ok) {
      throw new SyncRequestError(upload.status, `照片密文直传失败：HTTP ${upload.status}。`);
    }
    await this.request(
      `/v1/photos/${encodeURIComponent(photo.id)}/${photo.kind}/complete`,
      { method: 'POST', body: JSON.stringify({ uploadId: grant.uploadId }) },
    );
  }

  getPhoto(photoId: string): Promise<EncryptedPhotoV1> {
    return this.request(`/v1/photos/${encodeURIComponent(photoId)}`);
  }

  async getPhotoVariant(photoId: string, kind: PhotoKind): Promise<EncryptedPhotoV1> {
    let grant: PhotoDownloadGrant;
    try {
      grant = await this.request(
        `/v1/photos/${encodeURIComponent(photoId)}/${kind}/download`,
      );
    } catch (error) {
      if (error instanceof SyncRequestError && error.status === 404) {
        throw new PhotoVariantNotFoundError();
      }
      throw error;
    }
    if (grant.id !== photoId || grant.kind !== kind) {
      throw new Error('照片下载授权与请求的照片档位不一致。');
    }
    validateObjectRequest(grant.url, grant.headers);
    const download = await fetch(grant.url, {
      method: grant.method,
      headers: grant.headers,
    });
    if (!download.ok) {
      throw new SyncRequestError(download.status, `照片密文直下失败：HTTP ${download.status}。`);
    }
    const serializedContent = await download.text();
    if (utf8(serializedContent).byteLength !== grant.contentLength) {
      throw new Error('下载的照片密文长度与服务器记录不一致。');
    }
    if (grant.contentSha256) {
      const digest = await this.sha256Hex(serializedContent);
      if (digest !== grant.contentSha256) {
        throw new Error('下载的照片密文摘要与服务器记录不一致。');
      }
    }
    return {
      id: grant.id,
      kind: grant.kind,
      cryptoVersion: grant.cryptoVersion,
      metadata: grant.metadata,
      content: JSON.parse(serializedContent) as EncryptedPhotoV1['content'],
    };
  }

  logout(): Promise<void> {
    return this.request('/v1/auth/logout', { method: 'POST' });
  }
}
