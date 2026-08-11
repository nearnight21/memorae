import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import {
  PhotoObjectNotFoundError,
  type DirectPhotoObjectStore,
  type PhotoObjectHead,
} from './photoObjectStore';

interface CosResponse {
  Body?: unknown;
}

interface CosHeadResponse {
  ETag?: string;
  headers?: Record<string, unknown>;
}

interface CosClient {
  putObject(options: Record<string, unknown>, callback: (error: Error | null) => void): void;
  getObject(options: Record<string, unknown>, callback: (error: Error | null, response?: CosResponse) => void): void;
  deleteObject(options: Record<string, unknown>, callback: (error: Error | null) => void): void;
  headObject(options: Record<string, unknown>, callback: (error: Error | null, response?: CosHeadResponse) => void): void;
  getObjectUrl(options: Record<string, unknown>): string;
}

interface CosConstructor {
  new (options: { SecretId: string; SecretKey: string }): CosClient;
}

export interface TencentCosObjectStoreOptions {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
}

function required(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} 不能为空。`);
  return value;
}

function isNotFound(error: Error): boolean {
  const candidate = error as Error & { code?: string; statusCode?: number };
  return candidate.code === 'NoSuchKey'
    || candidate.code === 'NotFound'
    || candidate.statusCode === 404;
}

async function readBody(value: unknown): Promise<string> {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  if (value instanceof Readable || (value && Symbol.asyncIterator in Object(value))) {
    const chunks: Buffer[] = [];
    for await (const chunk of value as AsyncIterable<unknown>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('COS 返回了无效的照片密文内容。');
}

export class TencentCosObjectStore implements DirectPhotoObjectStore {
  private readonly client: CosClient;

  constructor(private readonly options: TencentCosObjectStoreOptions) {
    const require = createRequire(import.meta.url);
    const Cos = require('cos-nodejs-sdk-v5') as CosConstructor;
    this.client = new Cos({
      SecretId: required(options.secretId, 'MEMORY_RECALL_COS_SECRET_ID'),
      SecretKey: required(options.secretKey, 'MEMORY_RECALL_COS_SECRET_KEY'),
    });
    required(options.bucket, 'MEMORY_RECALL_COS_BUCKET');
    required(options.region, 'MEMORY_RECALL_COS_REGION');
  }

  async putObject(key: string, content: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.putObject({
        Bucket: this.options.bucket,
        Region: this.options.region,
        Key: key,
        Body: Buffer.from(content, 'utf8'),
        ContentType: 'application/json; charset=utf-8',
      }, (error) => error ? reject(error) : resolve());
    });
  }

  async getObject(key: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.client.getObject({
        Bucket: this.options.bucket,
        Region: this.options.region,
        Key: key,
      }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        void readBody(response?.Body).then(resolve, reject);
      });
    });
  }

  async deleteObject(key: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.deleteObject({
        Bucket: this.options.bucket,
        Region: this.options.region,
        Key: key,
      }, (error) => error ? reject(error) : resolve());
    });
  }

  async createSignedUrl(
    key: string,
    method: 'GET' | 'PUT',
    expiresInSeconds: number,
  ): Promise<string> {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
      throw new Error('COS 签名有效期必须在 1 到 3600 秒之间。');
    }
    const url = this.client.getObjectUrl({
      Bucket: this.options.bucket,
      Region: this.options.region,
      Key: key,
      Method: method,
      Sign: true,
      Expires: expiresInSeconds,
      Protocol: 'https:',
    });
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new Error('COS 返回了非 HTTPS 签名地址。');
    }
    return parsed.toString();
  }

  async headObject(key: string): Promise<PhotoObjectHead> {
    return new Promise<PhotoObjectHead>((resolve, reject) => {
      this.client.headObject({
        Bucket: this.options.bucket,
        Region: this.options.region,
        Key: key,
      }, (error, response) => {
        if (error) {
          reject(isNotFound(error) ? new PhotoObjectNotFoundError() : error);
          return;
        }
        const rawLength = response?.headers?.['content-length'];
        const contentLength = typeof rawLength === 'number'
          ? rawLength
          : Number(rawLength);
        if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
          reject(new Error('COS 返回了无效的照片密文长度。'));
          return;
        }
        resolve({
          contentLength,
          etag: typeof response?.ETag === 'string' ? response.ETag : null,
        });
      });
    });
  }
}
