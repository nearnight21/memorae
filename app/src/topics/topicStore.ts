import {
  decryptMemory, decryptMemoryV2, encryptMemory, encryptMemoryV2,
  type CryptoPrimitives, type VaultSessionV1, type EncryptedMemoryV1,
} from '../crypto';
import type { MemoryV2 } from '../memory/memoryV2';
import { emptyTopics, normalizeTopicIds, readTopics, topicName, TOPIC_RECORD_ID, type TopicCollection } from './topicModel';

export type TopicAction =
  | { kind: 'create'; id: string; name: string }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete' | 'touch'; id: string }
  | { kind: 'attach' | 'detach'; id: string; memoryIds: readonly string[] };
export interface TopicCommit {
  records: EncryptedMemoryV1[];
  expectedVersions: Record<string, number | null>;
}
export interface TopicStorage {
  listMemories(): Promise<EncryptedMemoryV1[]>;
  commit(change: TopicCommit): Promise<void>;
}
export async function loadTopics(primitives: CryptoPrimitives, session: VaultSessionV1, records: readonly EncryptedMemoryV1[]): Promise<TopicCollection> {
  const record = records.find((item) => item.id === TOPIC_RECORD_ID);
  if (!record || record.deleted) return emptyTopics();
  return readTopics(await decryptMemory(primitives, session, record));
}

/** 每次操作读取最新密文，事务提交时再校验版本；损坏记录不被空集合覆盖。 */
export async function changeTopics(
  primitives: CryptoPrimitives, session: VaultSessionV1, storage: TopicStorage,
  action: TopicAction, now = new Date().toISOString(),
): Promise<{ collection: TopicCollection; memories: MemoryV2[]; memoryIds: string[] }> {
  const records = await storage.listMemories();
  const current = records.find((item) => item.id === TOPIC_RECORD_ID);
  const collection = await loadTopics(primitives, session, records);
  const next: TopicCollection = { topics: [...collection.topics], lastUsedAt: { ...collection.lastUsedAt } };
  if (action.kind !== 'create' && !next.topics.some((topic) => topic.id === action.id)) throw new Error('这个主题已不存在，请重新选择。');
  if (action.kind === 'create') {
    if (next.topics.some((topic) => topic.id === action.id)) throw new Error('主题已经存在。');
    next.topics.push({ id: action.id, name: topicName(action.name), createdAt: now, updatedAt: now });
    next.lastUsedAt[action.id] = now;
  } else if (action.kind === 'rename') {
    next.topics = next.topics.map((topic) => topic.id === action.id ? { ...topic, name: topicName(action.name), updatedAt: now } : topic);
  } else if (action.kind === 'delete') {
    next.topics = next.topics.filter((topic) => topic.id !== action.id);
    delete next.lastUsedAt[action.id];
  } else if (action.kind === 'touch' || action.kind === 'attach') next.lastUsedAt[action.id] = now;

  const changed: EncryptedMemoryV1[] = [];
  const memories: MemoryV2[] = [];
  const expectedVersions: TopicCommit['expectedVersions'] = { [TOPIC_RECORD_ID]: current?.version ?? null };
  const selectedIds = new Set('memoryIds' in action ? action.memoryIds : []);
  if (action.kind === 'delete' || action.kind === 'attach' || action.kind === 'detach') {
    for (const record of records) {
      if (record.id === TOPIC_RECORD_ID || record.deleted || (action.kind !== 'delete' && !selectedIds.has(record.id))) continue;
      const { memory } = await decryptMemoryV2(primitives, session, record);
      const ids = normalizeTopicIds(memory.topicIds);
      const hasTopic = ids.includes(action.id);
      if ((action.kind === 'attach') === hasTopic) continue;
      const nextMemory = { ...memory, topicIds: action.kind === 'attach' ? [...ids, action.id] : ids.filter((id) => id !== action.id), updatedAt: now };
      expectedVersions[record.id] = record.version;
      changed.push(await encryptMemoryV2(primitives, session, nextMemory, record.version + 1));
      memories.push(nextMemory);
    }
  }
  changed.push(await encryptMemory(primitives, session, { id: TOPIC_RECORD_ID, ...next }, (current?.version ?? 0) + 1));
  if (session.destroyed) throw new Error('私密空间已锁定。');
  await storage.commit({ records: changed, expectedVersions });
  return { collection: next, memories, memoryIds: changed.map((record) => record.id) };
}

/** 同步照片扫描只需要照片引用，主题记录没有照片。 */
export async function decryptSyncRecord(primitives: CryptoPrimitives, session: VaultSessionV1, record: EncryptedMemoryV1) {
  if (record.id === TOPIC_RECORD_ID) return { photos: [] };
  return (await decryptMemoryV2(primitives, session, record)).memory;
}
