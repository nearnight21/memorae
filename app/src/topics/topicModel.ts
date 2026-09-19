import type { MemoryV2 } from '../memory/memoryV2';
import type { CameraState } from '../map/MemoraeMap.types';

export const TOPIC_RECORD_ID = 'topics';
export interface MemoryTopic { id: string; name: string; createdAt: string; updatedAt: string }
export interface TopicCollection { topics: MemoryTopic[]; lastUsedAt: Record<string, string> }
export const emptyTopics = (): TopicCollection => ({ topics: [], lastUsedAt: {} });

export function readTopics(value: unknown): TopicCollection {
  const record = value as Partial<TopicCollection> | null;
  if (!record || !Array.isArray(record.topics) || !record.lastUsedAt || typeof record.lastUsedAt !== 'object') {
    throw new Error('主题数据暂时无法读取，请重新同步后再试。');
  }
  const ids = new Set<string>();
  for (const topic of record.topics) {
    if (!topic || typeof topic.id !== 'string' || !topic.id.trim() || ids.has(topic.id)
      || typeof topic.name !== 'string' || !topic.name.trim()
      || !validDate(topic.createdAt) || !validDate(topic.updatedAt)) {
      throw new Error('主题数据暂时无法读取，请重新同步后再试。');
    }
    ids.add(topic.id);
  }
  if (Array.isArray(record.lastUsedAt) || Object.values(record.lastUsedAt).some((at) => !validDate(at))) {
    throw new Error('主题使用时间无效。');
  }
  return { topics: record.topics, lastUsedAt: record.lastUsedAt };
}
function validDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
export function topicName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('请输入主题名称。');
  if (trimmed.length > 40) throw new Error('主题名称不能超过 40 个字符。');
  return trimmed;
}
export function normalizeTopicIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean))]
    : [];
}
export function memoriesInTopic(memories: readonly MemoryV2[], topicId: string | null): MemoryV2[] {
  return memories.filter((memory) => !topicId || memory.topicIds?.includes(topicId));
}
export function recentTopics(collection: TopicCollection): MemoryTopic[] {
  return [...collection.topics].sort((a, b) => (
    (collection.lastUsedAt[b.id] ?? '').localeCompare(collection.lastUsedAt[a.id] ?? '')
    || b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name)
  ));
}
export function topicSummary(memories: readonly MemoryV2[]) {
  const sorted = [...memories].sort((a, b) => b.date.localeCompare(a.date));
  const places = new Set(memories.filter(hasCoordinates).map((memory) => (
    memory.location?.name?.trim() || memory.location?.city?.trim() || memory.location?.country?.trim()
  )).filter(Boolean));
  return {
    count: memories.length, placeCount: places.size,
    start: sorted.at(-1)?.date ?? null, end: sorted[0]?.date ?? null,
    coverPhotoId: sorted.find((memory) => memory.photos.length)?.photos[0].id ?? null,
  };
}
export function topicBadge(name: string, id: string): { initial: string; color: string } {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return {
    initial: (Array.from(name.trim())[0] ?? '#').toUpperCase(),
    color: ['#e9d8b5', '#c8dce2', '#d8dec5', '#e5cfc8', '#d6cde0', '#c8ddd5'][(hash >>> 0) % 6],
  };
}
function hasCoordinates(memory: MemoryV2): boolean {
  return Number.isFinite(memory.location?.lat) && Number.isFinite(memory.location?.lng);
}
/** 根据可用地图尺寸计算视野，避开顶部主题信息及底部时间轴。 */
export function topicCamera(memories: readonly MemoryV2[], width: number, height: number): CameraState | null {
  const points = memories.filter(hasCoordinates).map((memory) => memory.location!);
  if (!points.length) return null;
  const latitudes = points.map((point) => Math.max(-85, Math.min(85, point.lat!)));
  // 选择跨度最小的经度区间，兼容跨日期变更线的旅行。
  const longitudes = points.map((point) => (point.lng! + 360) % 360).sort((a, b) => a - b);
  let largestGap = -1;
  let start = longitudes[0];
  for (let i = 0; i < longitudes.length; i += 1) {
    const next = longitudes[(i + 1) % longitudes.length] + (i === longitudes.length - 1 ? 360 : 0);
    if (next - longitudes[i] > largestGap) { largestGap = next - longitudes[i]; start = next % 360; }
  }
  const span = 360 - largestGap;
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const south = mercator(Math.min(...latitudes));
  const north = mercator(Math.max(...latitudes));
  const zoomX = Math.log2(Math.max(120, width - 64) * 360 / (256 * Math.max(span, 0.00001)));
  const zoomY = Math.log2(Math.max(120, height - 380) * Math.PI * 2 / (256 * Math.max(north - south, 0.00001)));
  return {
    latitude: (2 * Math.atan(Math.exp((north + south) / 2)) - Math.PI / 2) * 180 / Math.PI,
    longitude: ((start + span / 2 + 180) % 360) - 180,
    zoom: Math.max(2, Math.min(15, zoomX, zoomY)),
  };
}
