import {
  decryptMemory,
  encryptMemory,
  type EncryptedMemoryV1,
  type VaultSessionV1,
} from '../crypto';
import { listEncryptedMemories, saveEncryptedMemory } from '../prototype/storage';
import {
  createEmptyTopicCollection,
  readTopicCollection,
  TOPIC_RECORD_ID,
  type TopicCollection,
} from '../memory/topic';

interface TopicRecord extends TopicCollection {
  id: typeof TOPIC_RECORD_ID;
}

async function currentTopicRecord(): Promise<EncryptedMemoryV1 | undefined> {
  const memories = await listEncryptedMemories();
  return memories.find((memory) => memory.id === TOPIC_RECORD_ID);
}

/**
 * 读取本地加密的主题集合。Topic 集合作为一条保留 id 的记录复用记忆密文仓库，
 * 服务端与照片链路都看不到明文。
 */
export async function loadTopicCollection(session: VaultSessionV1): Promise<TopicCollection> {
  const current = await currentTopicRecord();
  if (!current || current.deleted) return createEmptyTopicCollection();
  try {
    return readTopicCollection(await decryptMemory<TopicRecord>(session, current));
  } catch {
    // 单条主题记录损坏时退回空集合，不能阻塞整个私密空间解锁。
    return createEmptyTopicCollection();
  }
}

export async function saveTopicCollection(
  session: VaultSessionV1,
  collection: TopicCollection,
): Promise<TopicCollection> {
  const current = await currentTopicRecord();
  const record: TopicRecord = {
    id: TOPIC_RECORD_ID,
    topics: collection.topics,
    lastUsedAt: collection.lastUsedAt,
  };
  await saveEncryptedMemory(await encryptMemory(session, record, (current?.version ?? 0) + 1));
  return collection;
}
