export interface SealedBytesV1 {
  algorithm: 'AES-256-GCM';
  iv: string;
  ciphertext: string;
}

export interface VaultEnvelopeV1 {
  schema: 'memory-recall-vault';
  cryptoVersion: 1;
  createdAt: string;
  kdf: {
    name: 'Argon2id';
    salt: string;
    memoryKiB: number;
    iterations: number;
    parallelism: number;
    hashLength: 32;
  };
  wrappedVmk: SealedBytesV1;
  wrappedKeys: {
    text: SealedBytesV1;
    photo: SealedBytesV1;
  };
}

export interface EncryptedMemoryV1 {
  id: string;
  version: number;
  cryptoVersion: 1;
  deleted: boolean;
  payload: SealedBytesV1;
}

export const PHOTO_KINDS = ['thumbnail', 'preview', 'original'] as const;
export type PhotoKind = typeof PHOTO_KINDS[number];

export interface EncryptedPhotoV1 {
  id: string;
  cryptoVersion: 1;
  kind: PhotoKind;
  metadata: SealedBytesV1;
  content: SealedBytesV1;
}

export interface MemoryListResponse {
  items: EncryptedMemoryV1[];
}

export const sealedBytesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['algorithm', 'iv', 'ciphertext'],
  properties: {
    algorithm: { const: 'AES-256-GCM' },
    iv: { type: 'string', minLength: 1, maxLength: 128 },
    ciphertext: { type: 'string', minLength: 1 },
  },
} as const;

export const vaultEnvelopeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'cryptoVersion',
    'createdAt',
    'kdf',
    'wrappedVmk',
    'wrappedKeys',
  ],
  properties: {
    schema: { const: 'memory-recall-vault' },
    cryptoVersion: { const: 1 },
    createdAt: { type: 'string', minLength: 1, maxLength: 64 },
    kdf: {
      type: 'object',
      additionalProperties: false,
      required: [
        'name',
        'salt',
        'memoryKiB',
        'iterations',
        'parallelism',
        'hashLength',
      ],
      properties: {
        name: { const: 'Argon2id' },
        salt: { type: 'string', minLength: 1, maxLength: 256 },
        memoryKiB: { type: 'integer', minimum: 8192, maximum: 1048576 },
        iterations: { type: 'integer', minimum: 1, maximum: 20 },
        parallelism: { type: 'integer', minimum: 1, maximum: 16 },
        hashLength: { const: 32 },
      },
    },
    wrappedVmk: sealedBytesSchema,
    wrappedKeys: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'photo'],
      properties: {
        text: sealedBytesSchema,
        photo: sealedBytesSchema,
      },
    },
  },
} as const;

export const encryptedMemorySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'version', 'cryptoVersion', 'deleted', 'payload'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$',
    },
    version: { type: 'integer', minimum: 1 },
    cryptoVersion: { const: 1 },
    deleted: { type: 'boolean' },
    payload: sealedBytesSchema,
  },
} as const;

export const encryptedPhotoSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'cryptoVersion', 'kind', 'metadata', 'content'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$',
    },
    cryptoVersion: { const: 1 },
    kind: { enum: PHOTO_KINDS },
    metadata: sealedBytesSchema,
    content: sealedBytesSchema,
  },
} as const;

export const idParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$',
    },
  },
} as const;
