export const MEMORY_SCHEMA_VERSION = 1 as const;

export interface MemoryLocationV1 {
  name: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

export interface MemoryPhotoV1 {
  id: string;
  mimeType: string;
}

export interface MemoryV1 {
  schemaVersion: typeof MEMORY_SCHEMA_VERSION;
  id: string;
  title: string;
  text: string;
  date: string;
  tags: string[];
  location: MemoryLocationV1 | null;
  photos: MemoryPhotoV1[];
  createdAt: string;
  updatedAt: string;
}

export interface ReadMemoryV1Result {
  memory: MemoryV1;
  migrated: boolean;
}

export class MemorySchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemorySchemaError';
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: UnknownRecord, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function assertLocation(value: unknown): asserts value is MemoryLocationV1 | null {
  if (value === null) return;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['name', 'city', 'country', 'lat', 'lng']) ||
    !isNonEmptyString(value.name)
  ) {
    throw new MemorySchemaError('MemoryV1 的地点格式无效。');
  }
  for (const key of ['city', 'country'] as const) {
    if (value[key] !== undefined && !isNonEmptyString(value[key])) {
      throw new MemorySchemaError(`MemoryV1 的地点字段 ${key} 无效。`);
    }
  }
  if (
    value.lat !== undefined &&
    (typeof value.lat !== 'number' || !Number.isFinite(value.lat) || value.lat < -90 || value.lat > 90)
  ) {
    throw new MemorySchemaError('MemoryV1 的纬度无效。');
  }
  if (
    value.lng !== undefined &&
    (typeof value.lng !== 'number' || !Number.isFinite(value.lng) || value.lng < -180 || value.lng > 180)
  ) {
    throw new MemorySchemaError('MemoryV1 的经度无效。');
  }
}

export function assertMemoryV1(value: unknown): asserts value is MemoryV1 {
  if (!isRecord(value)) {
    throw new MemorySchemaError('解密后的记忆不是有效对象。');
  }
  if (value.schemaVersion !== MEMORY_SCHEMA_VERSION) {
    throw new MemorySchemaError(`不支持的记忆结构版本：${String(value.schemaVersion)}。`);
  }
  if (!hasOnlyKeys(value, [
    'schemaVersion',
    'id',
    'title',
    'text',
    'date',
    'tags',
    'location',
    'photos',
    'createdAt',
    'updatedAt',
  ])) {
    throw new MemorySchemaError('MemoryV1 包含未定义字段。');
  }
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.title)) {
    throw new MemorySchemaError('MemoryV1 的 ID 或标题无效。');
  }
  if (typeof value.text !== 'string' || !isDateOnly(value.date)) {
    throw new MemorySchemaError('MemoryV1 的正文或日期格式无效。');
  }
  if (!Array.isArray(value.tags) || !value.tags.every(isNonEmptyString)) {
    throw new MemorySchemaError('MemoryV1 的标签格式无效。');
  }
  assertLocation(value.location);
  if (!Array.isArray(value.photos)) {
    throw new MemorySchemaError('MemoryV1 的照片列表格式无效。');
  }
  const photoIds = new Set<string>();
  for (const photo of value.photos) {
    if (
      !isRecord(photo) ||
      !hasOnlyKeys(photo, ['id', 'mimeType']) ||
      !isNonEmptyString(photo.id) ||
      !isNonEmptyString(photo.mimeType)
    ) {
      throw new MemorySchemaError('MemoryV1 的照片引用格式无效。');
    }
    if (photoIds.has(photo.id)) {
      throw new MemorySchemaError(`MemoryV1 包含重复照片：${photo.id}。`);
    }
    photoIds.add(photo.id);
  }
  if (!isUtcTimestamp(value.createdAt) || !isUtcTimestamp(value.updatedAt)) {
    throw new MemorySchemaError('MemoryV1 的时间戳格式无效。');
  }
}

function migrateLegacyLocation(value: unknown): MemoryLocationV1 | null {
  if (typeof value === 'string') {
    return value.trim() ? { name: value.trim() } : null;
  }
  if (!isRecord(value) || !isNonEmptyString(value.name)) return null;
  const location: MemoryLocationV1 = { name: value.name };
  if (isNonEmptyString(value.city)) location.city = value.city;
  if (isNonEmptyString(value.country)) location.country = value.country;
  if (typeof value.lat === 'number') location.lat = value.lat;
  if (typeof value.lng === 'number') location.lng = value.lng;
  return location;
}

function migrateLegacyMemory(value: UnknownRecord): MemoryV1 {
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.title) ||
    typeof value.body !== 'string' ||
    !isDateOnly(value.date) ||
    !isUtcTimestamp(value.createdAt)
  ) {
    throw new MemorySchemaError('旧版原型记忆格式无效，无法迁移到 MemoryV1。');
  }
  const tags = Array.isArray(value.tags) ? value.tags.filter(isNonEmptyString) : [];
  const memory: MemoryV1 = {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    id: value.id,
    title: value.title,
    text: value.body,
    date: value.date,
    tags,
    location: migrateLegacyLocation(value.location),
    photos: isNonEmptyString(value.photoId)
      ? [{ id: value.photoId, mimeType: 'application/octet-stream' }]
      : [],
    createdAt: value.createdAt,
    updatedAt: value.createdAt,
  };
  assertMemoryV1(memory);
  return memory;
}

export function readMemoryV1(value: unknown): ReadMemoryV1Result {
  if (!isRecord(value)) {
    throw new MemorySchemaError('解密后的记忆不是有效对象。');
  }
  if (value.schemaVersion === undefined) {
    return { memory: migrateLegacyMemory(value), migrated: true };
  }
  assertMemoryV1(value);
  return { memory: value, migrated: false };
}
