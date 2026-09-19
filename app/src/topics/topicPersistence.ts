import type { EncryptedMemoryV1 } from '../crypto';
import { mergeUploadPlans, type UploadPlan } from '../sync/syncActions';
import type { TopicCommit } from './topicStore';

export const TOPIC_PENDING_UPLOAD_KEY = 'pending-upload-plan-v1';
export interface TopicTransaction {
  getFirstAsync<T>(sql: string, ...params: string[]): Promise<T | null>;
  runAsync(sql: string, ...params: string[]): Promise<unknown>;
}

/** 必须在 SQLite 独占事务内执行；同时提交记录及待同步计划。 */
export async function writeTopicTransaction(transaction: TopicTransaction, change: TopicCommit, shouldUpload: boolean, isActive: () => boolean): Promise<void> {
  if (!isActive()) throw new Error('私密空间已锁定。');
  for (const [id, expected] of Object.entries(change.expectedVersions)) {
    const row = await transaction.getFirstAsync<{ encrypted_json: string }>('SELECT encrypted_json FROM memories WHERE id = ?', id);
    const current = row ? JSON.parse(row.encrypted_json) as EncryptedMemoryV1 : null;
    if ((current?.version ?? null) !== expected) throw new Error('主题或记忆已更新，请重新操作。');
  }
  for (const record of change.records) {
    await transaction.runAsync(
      'INSERT INTO memories (id, encrypted_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET encrypted_json = excluded.encrypted_json',
      record.id, JSON.stringify(record),
    );
  }
  if (shouldUpload) {
    const row = await transaction.getFirstAsync<{ value: string }>('SELECT value FROM metadata WHERE key = ?', TOPIC_PENDING_UPLOAD_KEY);
    const pending: UploadPlan = row ? JSON.parse(row.value) : { memoryIds: [], photoRefs: [] };
    const plan = mergeUploadPlans(pending, { memoryIds: change.records.map((record) => record.id), photoRefs: [] });
    await transaction.runAsync(
      'INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      TOPIC_PENDING_UPLOAD_KEY, JSON.stringify(plan),
    );
  }
  if (!isActive()) throw new Error('私密空间已锁定。');
}
