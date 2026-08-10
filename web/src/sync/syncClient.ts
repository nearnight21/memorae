import type {
  EncryptedMemoryV1,
  EncryptedPhotoV1,
  VaultEnvelopeV1,
} from '../crypto';

export interface SyncClientOptions {
  baseUrl: string;
  token: string;
}

export class SyncRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

export class MemoryRecallSyncClient {
  private readonly baseUrl: string;

  constructor(private readonly options: SyncClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
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

  putPhoto(photo: EncryptedPhotoV1): Promise<void> {
    return this.request(`/v1/photos/${encodeURIComponent(photo.id)}`, {
      method: 'PUT',
      body: JSON.stringify(photo),
    });
  }

  getPhoto(photoId: string): Promise<EncryptedPhotoV1> {
    return this.request(`/v1/photos/${encodeURIComponent(photoId)}`);
  }
}
