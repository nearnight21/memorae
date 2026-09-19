import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { base64ToBytes, createVault, decryptMemoryV2, encryptMemory, encryptMemoryV2, destroyVaultSession, type EncryptedMemoryV1, type MemoryV2, type VaultSessionV1 } from '../src/crypto';
import { nodeCryptoPrimitives as primitives } from './support/nodePrimitives';
import { changeTopics, decryptSyncRecord, loadTopics, type TopicCommit } from '../src/topics/topicStore';
import { emptyTopics, memoriesInTopic, normalizeTopicIds, recentTopics, topicBadge, topicCamera, topicName, topicSummary, TOPIC_RECORD_ID } from '../src/topics/topicModel';
import { loadDecryptedMemories } from '../src/memory/memoryStore';
import { buildCreatedMemory, buildEditedMemory } from '../src/edit/editLifecycle';
import { downloadCiphertext, uploadCiphertext, type CipherSyncStorage, type UploadPlan } from '../src/sync/syncActions';
import type { MemoryRecallSyncClient } from '../src/sync/syncClient';
import { writeTopicTransaction, TOPIC_PENDING_UPLOAD_KEY, type TopicTransaction } from '../src/topics/topicPersistence';

const webFixture = JSON.parse(readFileSync(new URL('./fixtures/web-topics-v1.json', import.meta.url), 'utf8')) as {
  topic: { id: string; topics: Array<{ id: string; name: string; createdAt: string; updatedAt: string }>; lastUsedAt: Record<string, string> };
  memory: MemoryV2; edited: MemoryV2;
  topicCipher: EncryptedMemoryV1; memoryCipher: EncryptedMemoryV1; editedCipher: EncryptedMemoryV1;
};

const now = '2026-09-19T00:00:00.000Z';
const sample = (id: string, topicIds?: string[]): MemoryV2 => ({
  schemaVersion: 2, id, title: id, date: '2026-09-19', category: 'growth', tag: '',
  pastSelf: '只有文字的记忆', presentSelf: '', pinnedBy: 'pin', board: { px: 20, py: 20, rotation: 0 },
  location: null, photos: [], createdAt: now, updatedAt: now, ...(topicIds ? { topicIds } : {}),
});
const newSession = () => createVault(primitives, '测试主题密码', { memoryKiB: 8192, iterations: 2, parallelism: 1 });
function storage(initial: EncryptedMemoryV1[] = []) {
  const records = new Map(initial.map((record) => [record.id, record]));
  let pending: UploadPlan = { memoryIds: [], photoRefs: [] };
  return {
    records,
    get pending() { return pending; },
    listMemories: async () => [...records.values()],
    commit: async (change: TopicCommit) => {
      for (const [id, version] of Object.entries(change.expectedVersions)) {
        if ((records.get(id)?.version ?? null) !== version) throw new Error('版本冲突');
      }
      for (const record of change.records) records.set(record.id, record);
      pending = { memoryIds: [...new Set([...pending.memoryIds, ...change.records.map((record) => record.id)])], photoRefs: [] };
    },
  };
}

test('Web 固定主题夹具可由 App 解密，App 修改后的密文与 Web 固定向量一致', async () => {
  const session: VaultSessionV1 = { cryptoVersion: 1, vmk: new Uint8Array(32).fill(17), textKey: new Uint8Array(32).fill(34), photoKey: new Uint8Array(32).fill(51), destroyed: false };
  const local = storage([webFixture.topicCipher, webFixture.memoryCipher]);
  assert.deepEqual(await loadTopics(primitives, session, await local.listMemories()), { topics: webFixture.topic.topics, lastUsedAt: webFixture.topic.lastUsedAt });
  const updated = await changeTopics(primitives, session, local, { kind: 'rename', id: 'topic_web', name: '一路向西' });
  const restored = await loadTopics(primitives, session, await local.listMemories());
  assert.equal(restored.topics[0].name, '一路向西');
  assert.equal(restored.topics[0].id, 'topic_web');
  assert.deepEqual(updated.memoryIds, [TOPIC_RECORD_ID]);
  const decoded = (await decryptMemoryV2(primitives, session, webFixture.memoryCipher)).memory;
  assert.deepEqual(decoded, webFixture.memory);
  const edited = buildEditedMemory(decoded, { ...decoded, topicIds: ['topic_other'], title: '编辑后的记忆' }, decoded.photos, now);
  const appCipher = await encryptMemoryV2({ ...primitives, randomBytes: async () => base64ToBytes(webFixture.editedCipher.payload.iv) }, session, edited, 2);
  assert.deepEqual(appCipher, webFixture.editedCipher);
  assert.deepEqual(await encryptMemory({ ...primitives, randomBytes: async () => base64ToBytes(webFixture.topicCipher.payload.iv) }, session, webFixture.topic), webFixture.topicCipher);
  destroyVaultSession(session);
});

test('App 创建主题、批量加入、移出和删除仅修改目标关联，不触及照片', async () => {
  const { session } = await newSession();
  const first = { ...sample('a'), photos: [{ id: 'photo-a', mimeType: 'image/jpeg' }] };
  const second = sample('b', ['other']);
  const untouched = await encryptMemoryV2(primitives, session, sample('c'));
  const local = storage([await encryptMemoryV2(primitives, session, first), await encryptMemoryV2(primitives, session, second), untouched]);
  await changeTopics(primitives, session, local, { kind: 'create', id: 'topic_app', name: ' 家人的日子 ' }, now);
  let result = await changeTopics(primitives, session, local, { kind: 'attach', id: 'topic_app', memoryIds: ['a', 'b', 'a', 'missing'] });
  assert.equal(result.memories.length, 2);
  assert.deepEqual(result.memories.find((memory) => memory.id === 'b')?.topicIds, ['other', 'topic_app']);
  const version = local.records.get('a')!.version;
  await changeTopics(primitives, session, local, { kind: 'attach', id: 'topic_app', memoryIds: ['a'] });
  assert.equal(local.records.get('a')!.version, version);
  result = await changeTopics(primitives, session, local, { kind: 'detach', id: 'topic_app', memoryIds: ['a'] });
  assert.deepEqual(result.memories[0].topicIds, []);
  result = await changeTopics(primitives, session, local, { kind: 'delete', id: 'topic_app' });
  assert.deepEqual(result.memories[0].topicIds, ['other']);
  assert.deepEqual(result.collection, emptyTopics());
  assert.equal(local.records.get('c'), untouched);
  assert.ok([...local.records.values()].every((record) => !record.deleted));
  assert.deepEqual((await decryptMemoryV2(primitives, session, local.records.get('a')!)).memory.photos, first.photos);
  assert.deepEqual(local.pending.photoRefs, []);
  destroyVaultSession(session);
});

test('旧记忆兼容且主题保留记录不被计为解密失败或记忆', async () => {
  const { session } = await newSession();
  const topic = await encryptMemory(primitives, session, { id: TOPIC_RECORD_ID, ...emptyTopics() });
  const memory = await encryptMemoryV2(primitives, session, sample('old'));
  const snapshot = await loadDecryptedMemories(primitives, session, { listMemories: async () => [topic, memory], saveMemory: async () => undefined });
  assert.equal(snapshot.memories.length, 1);
  assert.equal(snapshot.decryptFailedCount, 0);
  assert.deepEqual(memoriesInTopic(snapshot.memories, null), snapshot.memories);
  assert.deepEqual(memoriesInTopic(snapshot.memories, 'topic_a'), []);
  destroyVaultSession(session);
});

test('损坏主题和并发版本变化均中止写入，不覆盖为新集合', async () => {
  const { session } = await newSession();
  const broken = await encryptMemory(primitives, session, { id: TOPIC_RECORD_ID, topics: 'broken' });
  const local = storage([broken]);
  await assert.rejects(changeTopics(primitives, session, local, { kind: 'create', id: 'new', name: '新主题' }));
  assert.equal(local.records.get(TOPIC_RECORD_ID), broken);
  const fresh = storage();
  await changeTopics(primitives, session, fresh, { kind: 'create', id: 'new', name: '新主题' });
  const record = fresh.records.get(TOPIC_RECORD_ID)!;
  const raced = { ...fresh, commit: async (change: TopicCommit) => {
    fresh.records.set(TOPIC_RECORD_ID, { ...record, version: record.version + 1 });
    await fresh.commit(change);
  } };
  await assert.rejects(changeTopics(primitives, session, raced, { kind: 'rename', id: 'new', name: '不应保存' }), /版本冲突/);
  assert.equal(fresh.records.get(TOPIC_RECORD_ID)!.payload, record.payload);
  destroyVaultSession(session);
});

test('仅同步主题不请求任何照片，主题与普通记忆分别恢复', async () => {
  const { session, envelope } = await newSession();
  const local = storage();
  await changeTopics(primitives, session, local, { kind: 'create', id: 'reading', name: '读书' });
  const remote = [...local.records.values()];
  const received = storage();
  let photoRequests = 0;
  const syncStorage: CipherSyncStorage = {
    getVault: async () => envelope, saveVault: async () => undefined,
    listMemories: received.listMemories, getMemory: async (id) => received.records.get(id) ?? null,
    saveMemory: async (record) => { received.records.set(record.id, record); },
    listPhotos: async () => [], savePhoto: async () => undefined,
  };
  const client = { getVault: async () => envelope, listMemories: async () => remote,
    getPhotoVariant: async () => { photoRequests += 1; throw new Error('不应下载照片'); },
  } as unknown as MemoryRecallSyncClient;
  const result = await downloadCiphertext({ client, storage: syncStorage, decryptMemory: (record) => decryptSyncRecord(primitives, session, record) });
  assert.equal(result.photos, 0);
  assert.equal(photoRequests, 0);
  assert.equal((await loadTopics(primitives, session, await received.listMemories())).topics[0].name, '读书');
  const sent: string[] = [];
  await uploadCiphertext({ getVault: async () => envelope, putVault: async () => undefined, putMemory: async (record: EncryptedMemoryV1) => { sent.push(record.id); } } as unknown as MemoryRecallSyncClient,
    syncStorage, { plan: { memoryIds: [TOPIC_RECORD_ID], photoRefs: [] } });
  assert.deepEqual(sent, [TOPIC_RECORD_ID]);
  destroyVaultSession(session);
});

test('锁定期间的主题操作不能提交密文', async () => {
  const { session } = await newSession();
  let committed = false;
  destroyVaultSession(session);
  await assert.rejects(changeTopics(primitives, session, { listMemories: async () => [], commit: async () => { committed = true; } }, { kind: 'create', id: 'a', name: '旅行' }));
  assert.equal(committed, false);
});

test('主题内纯文字创建默认关联，编辑支持移出所有主题', () => {
  const draft = { ...sample('draft'), topicIds: ['a', 'a', ' b ', ''] };
  const created = buildCreatedMemory(draft, [], 'new', now);
  assert.deepEqual(created.topicIds, ['a', 'b']);
  assert.equal(created.location, null);
  assert.deepEqual(created.photos, []);
  const edited = buildEditedMemory(created, { ...draft, topicIds: [] }, [], now);
  assert.deepEqual(edited.topicIds, []);
});

test('主题统计包含无地点记忆，最近使用排序和徽标稳定', () => {
  const values = [sample('unlocated', ['a']), { ...sample('located', ['a']), date: '2020-01-01', location: { name: '杭州', lat: 30, lng: 120, mx: 50, my: 50 }, photos: [{ id: 'photo', mimeType: 'image/jpeg' }] }];
  assert.deepEqual(topicSummary(values), { count: 2, placeCount: 1, start: '2020-01-01', end: '2026-09-19', coverPhotoId: 'photo' });
  assert.deepEqual(normalizeTopicIds(['a', ' a ', '', 3]), ['a']);
  const topics = [{ id: 'a', name: 'a', createdAt: now, updatedAt: now }, { id: 'b', name: 'b', createdAt: now, updatedAt: now }];
  assert.equal(recentTopics({ topics, lastUsedAt: { b: now } })[0].id, 'b');
  assert.equal(topicBadge('japan', 'a').initial, 'J');
  assert.equal(topicBadge('改名', 'a').color, topicBadge('旧名', 'a').color);
  assert.throws(() => topicName('   '));
});

test('主题视野覆盖多个地点、单点和跨日期变更线，空主题不移动地图', () => {
  assert.equal(topicCamera([sample('none')], 390, 844), null);
  const located = (id: string, lat: number, lng: number) => ({ ...sample(id), location: { name: id, lat, lng, mx: 50, my: 50 } });
  const point = topicCamera([located('a', 30, 120)], 390, 844)!;
  assert.ok(Math.abs(point.latitude - 30) < 1e-8);
  assert.equal(point.longitude, 120);
  assert.equal(point.zoom, 15);
  const broad = topicCamera([located('a', 30, 120), located('b', 40, 80)], 390, 844)!;
  assert.equal(broad.longitude, 100);
  assert.ok(broad.zoom < 4);
  const wrapped = topicCamera([located('a', 10, 179), located('b', 10, -179)], 390, 844)!;
  assert.equal(wrapped.longitude, -180);
  assert.ok(wrapped.zoom > 7);
});

test('SQLite 事务原子保存主题与增量计划，锁定或写入失败整批回滚', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, encrypted_json TEXT); CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT);');
  const { session } = await newSession();
  const record = await encryptMemory(primitives, session, { id: TOPIC_RECORD_ID, ...emptyTopics() });
  const transaction: TopicTransaction = {
    getFirstAsync: async <T>(sql: string, ...params: string[]) => (database.prepare(sql).get(...params) as T | undefined) ?? null,
    runAsync: async (sql, ...params) => database.prepare(sql).run(...params),
  };
  async function commit(change: TopicCommit, active = () => true, target = transaction, upload = true) {
    database.exec('BEGIN IMMEDIATE');
    try { await writeTopicTransaction(target, change, upload, active); database.exec('COMMIT'); }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  const pending = { memoryIds: ['already-pending'], photoRefs: [{ id: 'existing-photo', kind: 'thumbnail' }] };
  database.prepare('INSERT INTO metadata VALUES (?, ?)').run(TOPIC_PENDING_UPLOAD_KEY, JSON.stringify(pending));
  const change = { records: [record], expectedVersions: { topics: null } };
  let calls = 0;
  await assert.rejects(commit(change, () => ++calls < 2), /锁定/);
  assert.equal(database.prepare('SELECT * FROM memories').all().length, 0);
  assert.deepEqual(JSON.parse((database.prepare('SELECT value FROM metadata').get() as { value: string }).value), pending);
  await assert.rejects(commit(change, () => true, { ...transaction, runAsync: async (sql, ...params) => {
    if (sql.includes('metadata')) throw new Error('模拟磁盘写入失败');
    return transaction.runAsync(sql, ...params);
  } }), /写入失败/);
  assert.equal(database.prepare('SELECT * FROM memories').all().length, 0);
  await commit(change);
  assert.equal(database.prepare('SELECT * FROM memories').all().length, 1);
  assert.deepEqual(JSON.parse((database.prepare('SELECT value FROM metadata').get() as { value: string }).value), { memoryIds: ['already-pending', 'topics'], photoRefs: pending.photoRefs });
  await assert.rejects(commit(change), /已更新/);
  database.exec('DELETE FROM metadata; DELETE FROM memories');
  await commit(change, () => true, transaction, false);
  assert.equal(database.prepare('SELECT * FROM metadata').all().length, 0);
  database.close(); destroyVaultSession(session);
});
