/**
 * 产品“主题”（Topic）的数据模型。
 *
 * 一条记忆可以不属于任何主题，也可以归属一个或多个主题；关联使用稳定的
 * Topic id，而不是主题名称。Topic 集合整体以一条加密记录保存在本地并复用
 * 现有记忆同步通道，服务端只能看到密文。
 */
export interface MemoryTopic {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** lastUsedAt 只记录最近进入或创建记忆时用过的主题，用于“最近使用”排序。 */
export interface TopicCollection {
  topics: MemoryTopic[];
  lastUsedAt: Record<string, string>;
}

/** Topic 集合在本地密文仓库中使用的保留记录 id。 */
export const TOPIC_RECORD_ID = 'topics';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

export function createEmptyTopicCollection(): TopicCollection {
  return { topics: [], lastUsedAt: {} };
}

export function createMemoryTopic(name: string, now = new Date().toISOString()): MemoryTopic {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('主题名称不能为空。');
  return {
    id: `topic_${crypto.randomUUID()}`,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
}

function isMemoryTopic(value: unknown): value is MemoryTopic {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.name)
    && isIsoDate(value.createdAt)
    && isIsoDate(value.updatedAt);
}

export function assertTopicCollection(value: unknown): asserts value is TopicCollection {
  if (!isRecord(value) || !Array.isArray(value.topics) || !isRecord(value.lastUsedAt)) {
    throw new Error('主题集合结构无效。');
  }
  const ids = new Set<string>();
  for (const topic of value.topics) {
    if (!isMemoryTopic(topic)) throw new Error('主题条目无效。');
    if (ids.has(topic.id)) throw new Error(`主题集合包含重复主题：${topic.id}。`);
    ids.add(topic.id);
  }
  for (const [key, at] of Object.entries(value.lastUsedAt)) {
    if (typeof at !== 'string' || Number.isNaN(new Date(at).getTime())) {
      throw new Error(`主题使用时间无效：${key}。`);
    }
  }
}

/** 读取主题集合；遇到损坏或旧数据时回退为空集合，避免阻塞解锁。 */
export function readTopicCollection(value: unknown): TopicCollection {
  if (!isRecord(value)) return createEmptyTopicCollection();
  const topics = Array.isArray(value.topics) ? value.topics.filter(isMemoryTopic) : [];
  const ids = new Set(topics.map((topic) => topic.id));
  const lastUsedAt: Record<string, string> = {};
  if (isRecord(value.lastUsedAt)) {
    for (const [key, at] of Object.entries(value.lastUsedAt)) {
      if (ids.has(key) && isIsoDate(at)) lastUsedAt[key] = at;
    }
  }
  return { topics, lastUsedAt };
}

export function addTopic(
  collection: TopicCollection,
  topic: MemoryTopic,
): TopicCollection {
  if (collection.topics.some((existing) => existing.id === topic.id)) return collection;
  return {
    topics: [...collection.topics, topic],
    lastUsedAt: { ...collection.lastUsedAt },
  };
}

export function renameTopic(
  collection: TopicCollection,
  topicId: string,
  name: string,
  now = new Date().toISOString(),
): TopicCollection {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('主题名称不能为空。');
  return {
    topics: collection.topics.map((topic) => (
      topic.id === topicId ? { ...topic, name: trimmed, updatedAt: now } : topic
    )),
    lastUsedAt: { ...collection.lastUsedAt },
  };
}

export function removeTopic(collection: TopicCollection, topicId: string): TopicCollection {
  if (!collection.topics.some((topic) => topic.id === topicId)) return collection;
  const lastUsedAt = { ...collection.lastUsedAt };
  delete lastUsedAt[topicId];
  return {
    topics: collection.topics.filter((topic) => topic.id !== topicId),
    lastUsedAt,
  };
}

export function touchTopic(
  collection: TopicCollection,
  topicId: string,
  at = new Date().toISOString(),
): TopicCollection {
  if (!collection.topics.some((topic) => topic.id === topicId)) return collection;
  return {
    topics: collection.topics,
    lastUsedAt: { ...collection.lastUsedAt, [topicId]: at },
  };
}

/** 归一化单条记忆的 topicIds：去空、去重、仅保留字符串。 */
export function normalizeTopicIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 首字徽标色板数量，与 index.css 的 data-tone 一一对应。 */
export const TOPIC_BADGE_TONES = 6;

/** 无封面主题的占位字符：中文取首字、英文大写、数字取首位、空值回退 #。 */
export function topicBadgeInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '#';
  const first = Array.from(trimmed)[0];
  return /[a-z]/.test(first) ? first.toUpperCase() : first;
}

/** 名称/ID 派生稳定色调，同名同色且跨刷新不变。 */
export function topicBadgeTone(seed: string): number {
  return stableHash(seed) % TOPIC_BADGE_TONES;
}
