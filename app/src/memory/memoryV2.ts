import { readMemoryV1, type MemoryLocationV1, type MemoryPhotoV1, type MemoryV1 } from './memoryV1';

export const MEMORY_SCHEMA_VERSION_V2 = 2 as const;

export type MemoryCategoryV2 = 'travel' | 'growth' | 'motorcycle' | 'photography';
export type MemoryPinnedByV2 = 'pin' | 'magnet' | 'clip' | 'tape';

export interface MemoryLocationV2 extends MemoryLocationV1 {
  mx: number;
  my: number;
  detail?: string;
}
export interface MemoryV2 {
  schemaVersion: typeof MEMORY_SCHEMA_VERSION_V2;
  id: string;
  title: string;
  date: string;
  category: MemoryCategoryV2;
  tag: string;
  pastSelf: string;
  presentSelf: string;
  pinnedBy: MemoryPinnedByV2;
  board: { px: number; py: number; rotation: number };
  location: MemoryLocationV2 | null;
  photos: MemoryPhotoV1[];
  createdAt: string;
  updatedAt: string;
}

export interface ReadMemoryV2Result {
  memory: MemoryV2;
  migrated: boolean;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isFiniteBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function assertPhotos(value: unknown): asserts value is MemoryPhotoV1[] {
  if (!Array.isArray(value)) throw new Error('MemoryV2 的照片列表无效。');
  const ids = new Set<string>();
  for (const photo of value) {
    if (!isRecord(photo) || !isNonEmptyString(photo.id) || !isNonEmptyString(photo.mimeType)) {
      throw new Error('MemoryV2 的照片引用无效。');
    }
    if (ids.has(photo.id)) throw new Error(`MemoryV2 包含重复照片：${photo.id}。`);
    ids.add(photo.id);
  }
}

export function assertMemoryV2(value: unknown): asserts value is MemoryV2 {
  if (!isRecord(value) || value.schemaVersion !== MEMORY_SCHEMA_VERSION_V2) {
    throw new Error('记忆不是有效的 MemoryV2。');
  }
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.title)) {
    throw new Error('MemoryV2 的 ID 或标题无效。');
  }
  if (!isString(value.date) || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    throw new Error('MemoryV2 的日期无效。');
  }
  if (!['travel', 'growth', 'motorcycle', 'photography'].includes(String(value.category))) {
    throw new Error('MemoryV2 的分类无效。');
  }
  if (!isString(value.tag) || !isString(value.pastSelf) || !isString(value.presentSelf)) {
    throw new Error('MemoryV2 的正文或标签无效。');
  }
  if (!['pin', 'magnet', 'clip', 'tape'].includes(String(value.pinnedBy))) {
    throw new Error('MemoryV2 的固定方式无效。');
  }
  if (
    !isRecord(value.board)
    || !isFiniteBetween(value.board.px, 0, 100)
    || !isFiniteBetween(value.board.py, 0, 100)
    || !isFiniteBetween(value.board.rotation, -180, 180)
  ) {
    throw new Error('MemoryV2 的版面位置无效。');
  }
  if (value.location !== null) {
    if (
      !isRecord(value.location)
      || !isNonEmptyString(value.location.name)
      || !isFiniteBetween(value.location.mx, 0, 100)
      || !isFiniteBetween(value.location.my, 0, 100)
    ) {
      throw new Error('MemoryV2 的地点无效。');
    }
    if (value.location.lat !== undefined && !isFiniteBetween(value.location.lat, -90, 90)) {
      throw new Error('MemoryV2 的纬度无效。');
    }
    if (value.location.lng !== undefined && !isFiniteBetween(value.location.lng, -180, 180)) {
      throw new Error('MemoryV2 的经度无效。');
    }
    for (const key of ['city', 'country', 'detail'] as const) {
      if (value.location[key] !== undefined && !isNonEmptyString(value.location[key])) {
        throw new Error(`MemoryV2 的地点字段 ${key} 无效。`);
      }
    }
  }
  assertPhotos(value.photos);
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (!isString(value[key]) || Number.isNaN(new Date(value[key]).getTime())) {
      throw new Error(`MemoryV2 的时间字段 ${key} 无效。`);
    }
  }
}

function migrateMemoryV1(memory: MemoryV1): MemoryV2 {
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION_V2,
    id: memory.id,
    title: memory.title,
    date: memory.date,
    category: memory.location ? 'travel' : 'growth',
    tag: memory.tags.join(' · '),
    pastSelf: memory.text,
    presentSelf: '',
    pinnedBy: 'pin',
    board: { px: 20, py: 20, rotation: 0 },
    location: memory.location ? { ...memory.location, mx: 50, my: 50 } : null,
    photos: memory.photos,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

export function readMemoryV2(value: unknown): ReadMemoryV2Result {
  if (isRecord(value) && value.schemaVersion === MEMORY_SCHEMA_VERSION_V2) {
    assertMemoryV2(value);
    return { memory: value, migrated: false };
  }
  const legacy = readMemoryV1(value);
  return { memory: migrateMemoryV1(legacy.memory), migrated: true };
}
