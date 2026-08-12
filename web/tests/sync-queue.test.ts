import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccountSessionActive, isStoredAccountSession } from '../src/sync/accountSession';
import {
  completeCipherSyncQueueVersion,
  INITIAL_CIPHER_SYNC_QUEUE,
  markCipherSyncQueuePending,
  readCipherSyncQueueState,
} from '../src/sync/syncQueue';

test('账号会话只接受完整令牌和有效过期时间', () => {
  assert.equal(isStoredAccountSession(null), false);
  assert.equal(isStoredAccountSession({ accessToken: '', expiresAt: new Date().toISOString() }), false);
  assert.equal(isStoredAccountSession({ accessToken: 'token', expiresAt: 'invalid' }), false);
  assert.equal(isStoredAccountSession({
    accessToken: 'token',
    expiresAt: '2026-08-12T12:00:00.000Z',
  }), true);
});

test('账号会话在到期前保留安全余量', () => {
  const now = Date.parse('2026-08-12T12:00:00.000Z');
  assert.equal(isAccountSessionActive({
    accessToken: 'token',
    expiresAt: '2026-08-12T12:00:31.000Z',
  }, now), true);
  assert.equal(isAccountSessionActive({
    accessToken: 'token',
    expiresAt: '2026-08-12T12:00:30.000Z',
  }, now), false);
});

test('待同步版本在多次本地变更后持续递增', () => {
  const first = markCipherSyncQueuePending(INITIAL_CIPHER_SYNC_QUEUE);
  const second = markCipherSyncQueuePending(first);
  assert.deepEqual(second, { version: 3, uploadedVersion: 0 });
});

test('上传完成不能吞掉上传过程中发生的新变更', () => {
  const uploading = { version: 4, uploadedVersion: 2 };
  const changedDuringUpload = markCipherSyncQueuePending(uploading);
  const completed = completeCipherSyncQueueVersion(
    changedDuringUpload,
    uploading.version,
    '2026-08-12T12:00:00.000Z',
  );
  assert.deepEqual(completed, {
    version: 5,
    uploadedVersion: 4,
    lastSuccessAt: '2026-08-12T12:00:00.000Z',
  });
});

test('损坏的队列状态会回退为待同步初始状态', () => {
  assert.deepEqual(readCipherSyncQueueState({ version: -1, uploadedVersion: 9 }), INITIAL_CIPHER_SYNC_QUEUE);
  assert.deepEqual(readCipherSyncQueueState({ version: 2, uploadedVersion: 8 }), {
    version: 2,
    uploadedVersion: 2,
  });
});
