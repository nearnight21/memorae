import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVault,
  decryptMemory,
  decryptMemoryV2,
  encryptMemory,
  encryptMemoryV2,
  readMemoryV2,
  type EncryptedMemoryV1,
  type MemoryV2,
  type VaultEnvelopeV1,
} from '../src/crypto';
import {
  addTopic,
  createEmptyTopicCollection,
  createMemoryTopic,
  normalizeTopicIds,
  readTopicCollection,
  removeTopic,
  renameTopic,
  TOPIC_RECORD_ID,
  topicBadgeInitial,
  topicBadgeTone,
  touchTopic,
} from '../src/memory/topic';
import {
  attachTopicToMemories,
  defaultTopicIdsForCreate,
  detachTopicFromMemories,
  filterMemoriesByTopic,
  sortTopicsByRecent,
  topicCoverPhoto,
  topicMemoryStats,
} from '../src/lib/topicFilters';
import { EMPTY_MEMORY_FILTERS, filterMemories } from '../src/lib/memoryFilters';
import { downloadCiphertext, uploadCiphertext, type CipherSyncStorage } from '../src/sync/syncActions';
import type { Memory } from '../src/types';

const TEST_KDF = { memoryKiB: 8 * 1024, iterations: 2, parallelism: 1 };

function memoryV2(overrides: Partial<MemoryV2> = {}): MemoryV2 {
  return {
    schemaVersion: 2,
    id: 'memory-1',
    title: '标题',
    date: '2026-07-12',
    category: 'travel',
    tag: '',
    pastSelf: '',
    presentSelf: '',
    pinnedBy: 'pin',
    board: { px: 20, py: 20, rotation: 0 },
    location: { name: '拉萨', mx: 50, my: 50, lat: 29.65, lng: 91.14 },
    photos: [],
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    ...overrides,
  };
}

function displayMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'memory-1',
    title: '标题',
    date: '2026.07.12',
    year: 2026,
    category: 'travel',
    tag: '',
    image: '',
    gallery: [],
    pastSelf: '',
    presentSelf: '',
    pinnedBy: 'pin',
    px: 20,
    py: 20,
    rotation: 0,
    ...overrides,
  };
}

test('旧 MemoryV2 没有 topicIds 时仍可正常读取', async () => {
  const { session } = await createVault('password-1', TEST_KDF);
  const encrypted = await encryptMemoryV2(session, memoryV2());
  const result = await decryptMemoryV2(session, encrypted);
  assert.equal(result.memory.topicIds, undefined);
  assert.equal(result.migrated, false);
});

test('MemoryV2 可以关联一个或多个 Topic', () => {
  const single = readMemoryV2(memoryV2({ topicIds: ['topic_a'] })).memory;
  assert.deepEqual(single.topicIds, ['topic_a']);

  const multiple = readMemoryV2(memoryV2({ topicIds: ['topic_a', 'topic_b'] })).memory;
  assert.deepEqual(multiple.topicIds, ['topic_a', 'topic_b']);
});

test('Topic 筛选只保留所属主题的记忆', () => {
  const memories = [
    displayMemory({ id: 'm1', topicIds: ['topic_tibet'] }),
    displayMemory({ id: 'm2', topicIds: ['topic_japan'] }),
    displayMemory({ id: 'm3' }),
    displayMemory({ id: 'm4', topicIds: ['topic_tibet', 'topic_japan'] }),
  ];
  assert.deepEqual(
    filterMemoriesByTopic(memories, 'topic_tibet').map((memory) => memory.id),
    ['m1', 'm4'],
  );
  assert.deepEqual(
    filterMemoriesByTopic(memories, 'topic_japan').map((memory) => memory.id),
    ['m2', 'm4'],
  );
});

test('Topic 筛选与时间筛选可以叠加', () => {
  const memories = [
    displayMemory({ id: 'early', date: '2026.07.12', year: 2026, topicIds: ['topic_tibet'] }),
    displayMemory({ id: 'late', date: '2026.08.03', year: 2026, topicIds: ['topic_tibet'] }),
    displayMemory({ id: 'other', date: '2026.07.20', year: 2026, topicIds: ['topic_japan'] }),
  ];
  const byTopic = filterMemoriesByTopic(memories, 'topic_tibet');
  const combined = filterMemories(byTopic, {
    ...EMPTY_MEMORY_FILTERS,
    dateRange: { start: '2026-07-01', end: '2026-07-31' },
  });
  assert.deepEqual(combined.map((memory) => memory.id), ['early']);
});

test('退出主题后恢复全部记忆', () => {
  const memories = [
    displayMemory({ id: 'm1', topicIds: ['topic_tibet'] }),
    displayMemory({ id: 'm2' }),
  ];
  assert.deepEqual(
    filterMemoriesByTopic(memories, null).map((memory) => memory.id),
    ['m1', 'm2'],
  );
});

test('删除 Topic 只解除关联，不删除记忆', () => {
  const collection = addTopic(
    createEmptyTopicCollection(),
    createMemoryTopic('川藏旅行', '2026-07-01T00:00:00.000Z'),
  );
  const topicId = collection.topics[0].id;
  const memories = [
    displayMemory({ id: 'm1', topicIds: [topicId] }),
    displayMemory({ id: 'm2' }),
  ];
  const next = removeTopic(collection, topicId);
  const detached = detachTopicFromMemories(memories, topicId);
  assert.equal(next.topics.length, 0);
  assert.equal(detached.length, 2);
  assert.deepEqual(detached[0].topicIds, []);
  assert.equal(filterMemoriesByTopic(detached, topicId).length, 0);
  assert.equal(filterMemoriesByTopic(detached, null).length, 2);
});

test('Topic 改名不破坏关联', () => {
  const collection = addTopic(
    createEmptyTopicCollection(),
    createMemoryTopic('川藏旅行', '2026-07-01T00:00:00.000Z'),
  );
  const topicId = collection.topics[0].id;
  const renamed = renameTopic(collection, topicId, '2026 川藏旅行', '2026-07-02T00:00:00.000Z');
  assert.equal(renamed.topics[0].id, topicId);
  assert.equal(renamed.topics[0].name, '2026 川藏旅行');
  const memories = [displayMemory({ id: 'm1', topicIds: [topicId] })];
  assert.equal(filterMemoriesByTopic(memories, topicId).length, 1);
});

test('Topic 中记忆数量与日期范围统计正确', () => {
  const memories = [
    displayMemory({ id: 'm1', date: '2026.07.12', year: 2026, lat: 29.65, lng: 91.14, location: { name: '拉萨', mx: 50, my: 50 } }),
    displayMemory({ id: 'm2', date: '2026.07.20', year: 2026, lat: 29.65, lng: 91.14, location: { name: '拉萨', mx: 50, my: 50 } }),
    displayMemory({ id: 'm3', date: '2026.08.03', year: 2026, lat: 30.05, lng: 91.2, location: { name: '林芝', mx: 60, my: 60 } }),
    displayMemory({ id: 'm4', date: '2026.08.10', year: 2026 }),
  ];
  const stats = topicMemoryStats(memories);
  assert.equal(stats.count, 4);
  assert.equal(stats.placeCount, 2);
  assert.equal(stats.start, '2026-07-12');
  assert.equal(stats.end, '2026-08-10');
});

test('在主题上下文中新建记忆默认继承当前主题', () => {
  const topicId = 'topic_tibet';
  assert.deepEqual(defaultTopicIdsForCreate(topicId), [topicId]);
  assert.deepEqual(defaultTopicIdsForCreate(null), []);
  const created = displayMemory({ id: 'new', topicIds: defaultTopicIdsForCreate(topicId) });
  assert.equal(filterMemoriesByTopic([created], topicId).length, 1);
});

test('E2EE round-trip 保留 topicIds', async () => {
  const { session } = await createVault('password-2', TEST_KDF);
  const encrypted = await encryptMemoryV2(
    session,
    memoryV2({ topicIds: ['topic_a', 'topic_b'] }),
  );
  const result = await decryptMemoryV2(session, encrypted);
  assert.deepEqual(result.memory.topicIds, ['topic_a', 'topic_b']);
});

test('Topic 元数据自身加密 round-trip', async () => {
  const { session } = await createVault('password-3', TEST_KDF);
  const topic = createMemoryTopic('日本旅行', '2026-07-01T00:00:00.000Z');
  const collection = touchTopic(addTopic(createEmptyTopicCollection(), topic), topic.id, '2026-07-09T00:00:00.000Z');
  const encrypted = await encryptMemory(
    session,
    { id: TOPIC_RECORD_ID, topics: collection.topics, lastUsedAt: collection.lastUsedAt },
    1,
  );
  const decoded = await decryptMemory<unknown>(session, encrypted);
  const restored = readTopicCollection(decoded);
  assert.deepEqual(restored.topics, collection.topics);
  assert.deepEqual(restored.lastUsedAt, collection.lastUsedAt);
});

test('同步后 Topic 集合与记忆关联保持不变', async () => {
  const { session, envelope } = await createVault('password-4', TEST_KDF);
  const topic = createMemoryTopic('摩旅', '2026-07-01T00:00:00.000Z');
  const collection = addTopic(createEmptyTopicCollection(), topic);
  const topicCipher = await encryptMemory(
    session,
    { id: TOPIC_RECORD_ID, topics: collection.topics, lastUsedAt: collection.lastUsedAt },
    1,
  );
  const memoryCipher = await encryptMemoryV2(session, memoryV2({ topicIds: [topic.id] }), 1);

  const remote = new Map<string, EncryptedMemoryV1>();
  const client = {
    getVault: async (): Promise<VaultEnvelopeV1> => envelope,
    putVault: async () => undefined,
    putMemory: async (item: EncryptedMemoryV1) => { remote.set(item.id, item); },
    listMemories: async (): Promise<EncryptedMemoryV1[]> => [...remote.values()],
    putPhotoVariant: async () => undefined,
  } as unknown as Parameters<typeof uploadCiphertext>[0];

  const source: CipherSyncStorage = {
    getVault: async () => envelope,
    listMemories: async () => [topicCipher, memoryCipher],
    listPhotos: async () => [],
    saveVault: async () => undefined,
    saveMemory: async () => undefined,
    savePhoto: async () => undefined,
  };
  await uploadCiphertext(client, source);

  const restored = new Map<string, EncryptedMemoryV1>();
  const target: CipherSyncStorage = {
    getVault: async () => envelope,
    listMemories: async () => [],
    listPhotos: async () => [],
    saveVault: async () => undefined,
    saveMemory: async (item) => { restored.set(item.id, item); },
    savePhoto: async () => undefined,
  };
  await downloadCiphertext({
    client: { ...client, getVault: async () => envelope } as never,
    storage: target,
    decryptMemory: async (item) => {
      if (item.id === TOPIC_RECORD_ID) return { photos: [] };
      return (await decryptMemoryV2(session, item)).memory;
    },
  });

  assert.ok(restored.has(TOPIC_RECORD_ID));
  assert.ok(restored.has('memory-1'));

  const restoredTopics = readTopicCollection(
    await decryptMemory<unknown>(session, restored.get(TOPIC_RECORD_ID)!),
  );
  assert.deepEqual(restoredTopics.topics.map((entry) => entry.name), ['摩旅']);

  const restoredMemory = (await decryptMemoryV2(session, restored.get('memory-1')!)).memory;
  assert.deepEqual(restoredMemory.topicIds, [topic.id]);
  assert.equal(filterMemoriesByTopic(
    [displayMemory({ id: 'memory-1', topicIds: restoredMemory.topicIds })],
    restoredTopics.topics[0].id,
  ).length, 1);
});

test('最近使用排序优先，封面取最近有照片记忆', () => {
  const older = createMemoryTopic('家人', '2026-01-01T00:00:00.000Z');
  const newer = createMemoryTopic('川藏旅行', '2026-06-01T00:00:00.000Z');
  const collection = addTopic(addTopic(createEmptyTopicCollection(), older), newer);
  const sorted = sortTopicsByRecent(collection.topics, { [older.id]: '2026-07-09T00:00:00.000Z' });
  assert.deepEqual(sorted.map((topic) => topic.name), ['家人', '川藏旅行']);

  const cover = topicCoverPhoto([
    displayMemory({ id: 'm1', date: '2026.07.12', image: 'old.jpg' }),
    displayMemory({ id: 'm2', date: '2026.08.03', image: 'new.jpg' }),
    displayMemory({ id: 'm3', date: '2026.08.10' }),
  ]);
  assert.equal(cover, 'new.jpg');
  assert.equal(topicCoverPhoto([displayMemory({ id: 'none' })]), null);
});

test('topicIds 归一化去空去重', () => {
  assert.deepEqual(normalizeTopicIds(['a', '', ' a ', 'b', 'a', 3, null]), ['a', 'b']);
  assert.deepEqual(normalizeTopicIds(undefined), []);
});

test('把主题批量加入选中记忆时去重并跳过无效项', () => {
  const memories = [
    displayMemory({ id: 'm1' }),
    displayMemory({ id: 'm2', topicIds: ['topic_tibet'] }),
    displayMemory({ id: 'm3', topicIds: ['topic_japan'] }),
  ];
  const next = attachTopicToMemories(memories, 'topic_tibet', ['m1', 'm2', 'm1', 'missing']);
  assert.deepEqual(next[0].topicIds, ['topic_tibet']);
  assert.equal(next[1], memories[1]);
  assert.deepEqual(next[2].topicIds, ['topic_japan']);

  assert.equal(attachTopicToMemories(memories, 'topic_tibet', ['m2']), memories);
  assert.equal(attachTopicToMemories(memories, 'topic_tibet', []), memories);
  assert.equal(attachTopicToMemories(memories, '', ['m1']), memories);
  assert.equal(filterMemoriesByTopic(next, 'topic_tibet').length, 2);
});

test('主题首字徽标覆盖中英文数字并保持稳定', () => {
  assert.equal(topicBadgeInitial('2026 川藏旅行'), '2');
  assert.equal(topicBadgeInitial('japan trip'), 'J');
  assert.equal(topicBadgeInitial('  日本旅行'), '日');
  assert.equal(topicBadgeInitial('家人'), '家');
  assert.equal(topicBadgeInitial(''), '#');
  assert.equal(topicBadgeInitial('   '), '#');

  assert.equal(topicBadgeTone('topic_a'), topicBadgeTone('topic_a'));
  assert.equal(topicBadgeTone('2026 川藏旅行'), topicBadgeTone('2026 川藏旅行'));
  for (const seed of ['topic_a', 'topic_b', '家人', 'japan', '2026']) {
    const tone = topicBadgeTone(seed);
    assert.ok(Number.isInteger(tone) && tone >= 0 && tone < 6);
  }
});
