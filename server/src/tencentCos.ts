import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import type { PhotoObjectStore } from './photoObjectStore';

interface CosResponse {
  Body?: unknown;
}

interface CosClient {
  putObject(options: Record<string, unknown>, callback: (error: Error | null) => void): void;
  getObject(options: Record<string, unknown>, callback: (error: Error | null, response?: CosResponse) => void): void;
  deleteObject(options: Record<string, unknown>, callback: (error: Error | null) => void): void;
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

export class TencentCosObjectStore implements PhotoObjectStore {
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
}
