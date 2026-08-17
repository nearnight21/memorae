import type { MemoryV1 } from './memoryV1';
import type { MemoryV2 } from './memoryV2';
import type { CategoryType, Memory, PinnedBy } from '../types';

export interface VisibleMemoryV1 extends MemoryV1 {
  photoUrls: string[];
  thumbnailUrls: string[];
}

export interface VisibleMemoryV2 extends MemoryV2 {
  photoUrls: string[];
  thumbnailUrls: string[];
}

const categories: CategoryType[] = ['travel', 'growth', 'motorcycle', 'photography'];
const fasteners: PinnedBy[] = ['pin', 'magnet', 'clip', 'tape'];

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 把设备端解密后的正式 MemoryV1 转成现有地图/时间线的只读展示模型。 */
export function toDisplayMemory(memory: VisibleMemoryV1 | VisibleMemoryV2): Memory {
  const hash = stableHash(memory.id);

  if (memory.schemaVersion === 2) {
    const location = memory.location;
    return {
      id: memory.id,
      title: memory.title,
      date: memory.date,
      year: Number(memory.date.slice(0, 4)),
      category: memory.category,
      tag: memory.tag,
      image: memory.thumbnailUrls[0] ?? memory.photoUrls[0] ?? '',
      gallery: memory.photoUrls,
      pastSelf: memory.pastSelf,
      presentSelf: memory.presentSelf,
      pinnedBy: memory.pinnedBy,
      px: memory.board.px,
      py: memory.board.py,
      rotation: memory.board.rotation,
      location: location ? { name: location.name, mx: location.mx, my: location.my } : undefined,
      country: location?.country,
      province: location?.province,
      city: location?.city,
      district: location?.district ?? location?.detail,
      adcode: location?.adcode,
      locationProvider: location?.provider as 'amap' | undefined,
      locationProviderId: location?.providerId,
      lat: location?.lat,
      lng: location?.lng,
      detailLocation: location?.detail,
    };
  }

  const location = memory.location;

  return {
    id: memory.id,
    title: memory.title,
    date: memory.date,
    year: Number(memory.date.slice(0, 4)),
    category: categories[hash % categories.length],
    tag: memory.tags.join(' · '),
    image: memory.thumbnailUrls[0] ?? memory.photoUrls[0] ?? '',
    gallery: memory.photoUrls,
    pastSelf: memory.text,
    presentSelf: '',
    pinnedBy: fasteners[(hash >>> 3) % fasteners.length],
    px: 8 + (hash % 78),
    py: 8 + ((hash >>> 7) % 48),
    rotation: ((hash >>> 13) % 17) - 8,
    location: location
      ? { name: location.name, mx: 50, my: 50 }
      : undefined,
    country: location?.country,
    province: undefined,
    city: location?.city,
    lat: location?.lat,
    lng: location?.lng,
    detailLocation: location?.name,
  };
}
