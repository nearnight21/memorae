export interface PhotoObjectStore {
  putObject(key: string, content: string): Promise<void>;
  getObject(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

export interface PhotoObjectHead {
  contentLength: number;
  etag: string | null;
}

export class PhotoObjectNotFoundError extends Error {
  constructor(message = '照片密文对象不存在。') {
    super(message);
    this.name = 'PhotoObjectNotFoundError';
  }
}

export interface DirectPhotoObjectStore extends PhotoObjectStore {
  createSignedUrl(
    key: string,
    method: 'GET' | 'PUT',
    expiresInSeconds: number,
  ): Promise<string>;
  headObject(key: string): Promise<PhotoObjectHead>;
}
