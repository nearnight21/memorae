import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import {
  buildEditedMemory,
  createDeleteTombstone,
  mergePhotoManageSelection,
  removedPhotoIds,
} from '../src/edit/editLifecycle';

const memory = {
  schemaVersion: 2,
  id: 'memory-1',
  title: '原标题',
  date: '2026-08-23',
  category: 'growth',
  tag: '',
  pastSelf: '过去',
  presentSelf: '现在',
  pinnedBy: 'pin',
  board: { px: 20, py: 20, rotation: 0 },
  location: null,
  photos: [{ id: 'photo-1', mimeType: 'image/jpeg' }],
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
} as unknown as import('../src/memory/memoryV2').MemoryV2;

test('编辑保存只生成新 MemoryV2，不修改原对象并保留不可编辑字段', () => {
  const edited = buildEditedMemory(memory, {
    title: '  新标题 ',
    date: '2026-08-24',
    pastSelf: '新的过去',
    presentSelf: '新的现在',
    location: null,
  }, [{ id: 'photo-2', mimeType: 'image/png' }], '2026-08-24T00:00:00.000Z');

  assert.equal(edited.title, '新标题');
  assert.equal(edited.date, '2026-08-24');
  assert.equal(edited.updatedAt, '2026-08-24T00:00:00.000Z');
  assert.deepEqual(edited.photos, [{ id: 'photo-2', mimeType: 'image/png' }]);
  assert.equal(edited.createdAt, memory.createdAt);
  assert.equal(memory.title, '原标题');
  assert.deepEqual(memory.photos, [{ id: 'photo-1', mimeType: 'image/jpeg' }]);
});

test('删除生成递增版本 tombstone，取消操作不需要改变原密文', () => {
  const encrypted = {
    id: 'memory-1',
    version: 4,
    cryptoVersion: 1,
    deleted: false,
    payload: { algorithm: 'AES-256-GCM', iv: 'AA==', ciphertext: 'AA==' },
  } as const;
  const tombstone = createDeleteTombstone(encrypted);

  assert.equal(tombstone.version, 5);
  assert.equal(tombstone.deleted, true);
  assert.equal(encrypted.version, 4);
  assert.throws(() => createDeleteTombstone(tombstone), /已经被删除/);
});

test('照片删除只返回本次编辑中不再引用的照片', () => {
  assert.deepEqual(
    removedPhotoIds(
      [{ id: 'photo-1', mimeType: 'image/jpeg' }, { id: 'photo-2', mimeType: 'image/jpeg' }],
      [{ id: 'photo-2', mimeType: 'image/jpeg' }, { id: 'photo-3', mimeType: 'image/jpeg' }],
    ),
    ['photo-1'],
  );
});

test('照片管理确认会把新增的临时照片带回编辑草稿', () => {
  const pendingPhoto = { uri: 'file:///second.jpg', filename: 'second.jpg', mimeType: 'image/jpeg' };
  const result = mergePhotoManageSelection([
    { id: 'photo-1', mimeType: 'image/jpeg', pending: false },
    { id: 'pending:file:///second.jpg', mimeType: 'image/jpeg', pending: true },
  ], new Map([['pending:file:///second.jpg', pendingPhoto]]));

  assert.deepEqual(result.photos, [{ id: 'photo-1', mimeType: 'image/jpeg' }]);
  assert.deepEqual(result.pendingPhotos, [pendingPhoto]);
});

test('编辑保存打开详情时不等待详情照片下载', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');
  const openMemory = appSource.match(/function openMemory\(memory: MemoryV2\): void \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(openMemory, '找不到 openMemory 实现');
  assert.match(openMemory, /void loadDetailPhoto\(memory, index, requestId\)/);
  assert.doesNotMatch(openMemory, /await Promise\.all/);
});

test('编辑保存不等待孤立照片清理，避免保存按钮被全库解密阻塞', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');
  const saveEditedMemory = appSource.match(/async function saveEditedMemory\(\): Promise<void> \{[\s\S]*?\n  \}\n\n  async function deleteSelectedMemory/)?.[0];
  assert.ok(saveEditedMemory, '找不到 saveEditedMemory 实现');
  assert.match(saveEditedMemory, /void cleanupUnreferencedLocalPhotos\(orphanedPhotoIds, nextMemory\.id\)\.catch/);
  assert.doesNotMatch(saveEditedMemory, /await cleanupUnreferencedLocalPhotos/);
});

test('新增照片的缩略图和预览图并行生成并写入', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');
  const encryptPendingPhoto = appSource.match(/async function encryptPendingPhoto\([\s\S]*?\n  \}\n\n  async function saveMemory/)?.[0];
  assert.ok(encryptPendingPhoto, '找不到 encryptPendingPhoto 实现');
  assert.match(encryptPendingPhoto, /Promise\.all\(PHOTO_VARIANT_SPECS\.map/);
  assert.match(encryptPendingPhoto, /Promise\.all\(encryptedVariants\.map\(saveEncryptedPhoto\)\)/);
});

test('详情浏览只自动读取受限 thumbnail，避免阻塞关闭按钮', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');
  const loadDetailPhoto = appSource.match(/async function loadDetailPhoto\([\s\S]*?\n  \}\n\n  function openMemory/)?.[0];
  assert.ok(loadDetailPhoto, '找不到 loadDetailPhoto 实现');
  assert.match(loadDetailPhoto, /readDetailPhotoVariant\(photoId, 'thumbnail'\)/);
  assert.doesNotMatch(loadDetailPhoto, /readDetailPhotoVariant\(photoId, 'preview'\)/);
  assert.doesNotMatch(loadDetailPhoto, /readDetailPhotoVariant\(photoId, 'original'\)/);
});
