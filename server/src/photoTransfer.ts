import {
  PHOTO_KINDS,
  sealedBytesSchema,
  type PhotoKind,
  type SealedBytesV1,
} from './contracts';

export const PHOTO_CIPHER_CONTENT_TYPE = 'application/octet-stream';
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 5 * 60;
export const DEFAULT_PENDING_UPLOAD_TTL_MS = 15 * 60 * 1000;

export interface BeginPhotoUploadInput {
  id: string;
  kind: PhotoKind;
  cryptoVersion: 1;
  metadata: SealedBytesV1;
  contentLength: number;
  contentSha256: string;
}

export interface PhotoUploadGrant {
  status: 'upload';
  uploadId: string;
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface PhotoUploadAlreadyComplete {
  status: 'complete';
}

export type BeginPhotoUploadResult = PhotoUploadGrant | PhotoUploadAlreadyComplete;

export interface PhotoDownloadGrant {
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

export interface DirectPhotoTransfer {
  beginUpload(accountId: string, input: BeginPhotoUploadInput): Promise<BeginPhotoUploadResult>;
  completeUpload(
    accountId: string,
    photoId: string,
    kind: PhotoKind,
    uploadId: string,
  ): Promise<void>;
  createDownload(
    accountId: string,
    photoId: string,
    kind: PhotoKind,
  ): Promise<PhotoDownloadGrant | null>;
  cleanupExpiredUploads(): Promise<number>;
}

export class PhotoTransferConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoTransferConflictError';
  }
}

export class PhotoTransferNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoTransferNotFoundError';
  }
}

export class PhotoTransferValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoTransferValidationError';
  }
}

export const photoVariantParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'kind'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$',
    },
    kind: { enum: PHOTO_KINDS },
  },
} as const;

export const beginPhotoUploadBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cryptoVersion', 'metadata', 'contentLength', 'contentSha256'],
  properties: {
    cryptoVersion: { const: 1 },
    metadata: sealedBytesSchema,
    contentLength: {
      type: 'integer',
      minimum: 1,
      maximum: 64 * 1024 * 1024,
    },
    contentSha256: {
      type: 'string',
      pattern: '^[0-9a-f]{64}$',
    },
  },
} as const;

export const completePhotoUploadBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['uploadId'],
  properties: {
    uploadId: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    },
  },
} as const;
