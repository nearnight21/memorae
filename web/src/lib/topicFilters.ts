import type { Memory } from '../types';
import type { MemoryTopic } from '../memory/topic';
import { memoryDateOf } from './memoryFilters';

/** 主题筛选纯函数：selectedTopicId 为 null 时表示全部记忆。 */
export function filterMemoriesByTopic(
  memories: Memory[],
  selectedTopicId: string | null,
): Memory[] {
  if (!selectedTopicId) return memories;
  return memories.filter((memory) => memoryTopicIds(memory).includes(selectedTopicId));
}

export function memoryTopicIds(memory: Memory): string[] {
  return Array.isArray(memory.topicIds) ? memory.topicIds : [];
}

/** 在主题上下文中创建记忆时，默认继承当前主题，用户仍可在编辑页删除。 */
export function defaultTopicIdsForCreate(selectedTopicId: string | null): string[] {
  return selectedTopicId ? [selectedTopicId] : [];
}

/** 删除主题时只解除关联：返回去除该主题 id 的记忆副本，不删除记忆本身。 */
export function detachTopicFromMemories(memories: Memory[], topicId: string): Memory[] {
  return memories.map((memory) => {
    const ids = memoryTopicIds(memory);
    if (!ids.includes(topicId)) return memory;
    return { ...memory, topicIds: ids.filter((id) => id !== topicId) };
  });
}

/**
 * 把主题加入选中的记忆：跳过无效 id 与已属于该主题的记忆；
 * 没有任何变化时返回原数组引用，方便调用方判断是否需要保存。
 */
export function attachTopicToMemories(
  memories: Memory[],
  topicId: string,
  memoryIds: Iterable<string>,
): Memory[] {
  if (!topicId) return memories;
  const targetIds = new Set(memoryIds);
  if (targetIds.size === 0) return memories;
  let changed = false;
  const next = memories.map((memory) => {
    if (!targetIds.has(memory.id)) return memory;
    const ids = memoryTopicIds(memory);
    if (ids.includes(topicId)) return memory;
    changed = true;
    return { ...memory, topicIds: [...ids, topicId] };
  });
  return changed ? next : memories;
}

export interface TopicMemoryStats {
  count: number;
  placeCount: number;
  start: string | null;
  end: string | null;
}

/**
 * 主题统计：记忆数量、有坐标的 distinct 地点数量、最早与最晚日期。
 * 地点去重沿用项目已有 location/city/country 层级，不另造规则。
 */
export function topicMemoryStats(memories: Memory[]): TopicMemoryStats {
  const places = new Set<string>();
  let start: string | null = null;
  let end: string | null = null;
  for (const memory of memories) {
    const place = memoryPlaceKey(memory);
    if (place) places.add(place);
    const date = memoryDateOf(memory);
    if (!start || date < start) start = date;
    if (!end || date > end) end = date;
  }
  return { count: memories.length, placeCount: places.size, start, end };
}

function memoryPlaceKey(memory: Memory): string | null {
  const hasCoordinates = Number.isFinite(memory.lat) && Number.isFinite(memory.lng);
  if (!hasCoordinates) return null;
  return memory.location?.name?.trim()
    || memory.city?.trim()
    || memory.country?.trim()
    || null;
}

/** 主题封面：取主题内最近一条有照片记忆的照片，没有则返回 null。 */
export function topicCoverPhoto(memories: Memory[]): string | null {
  let cover: Memory | null = null;
  for (const memory of memories) {
    if (!memory.image) continue;
    if (!cover || memoryDateOf(memory) > memoryDateOf(cover)) cover = memory;
  }
  return cover?.image ?? null;
}

/** 最近使用优先，其次按创建时间倒序。 */
export function sortTopicsByRecent(
  topics: MemoryTopic[],
  lastUsedAt: Record<string, string>,
): MemoryTopic[] {
  return [...topics].sort((left, right) => {
    const leftUsed = lastUsedAt[left.id] ?? '';
    const rightUsed = lastUsedAt[right.id] ?? '';
    if (leftUsed !== rightUsed) return rightUsed.localeCompare(leftUsed);
    if (left.createdAt !== right.createdAt) return right.createdAt.localeCompare(left.createdAt);
    return left.name.localeCompare(right.name);
  });
}
