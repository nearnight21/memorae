import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  buildCreatedMemory,
  buildEditedMemory,
  createDeleteTombstone,
  mergePhotoManageSelection,
  removedPhotoIds,
} from '../src/edit/editLifecycle';
import { firstPhotoCoordinates, photoCoordinatesFromExif } from '../src/photos/photoMetadata';

const appSource = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');
const appSourceFile = ts.createSourceFile(
  'App.tsx',
  appSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function sourceForAppFunction(name: string): string {
  let start = -1;
  let end = -1;
  const visit = (node: ts.Node): void => {
    if (start >= 0) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      start = node.getStart(appSourceFile);
      end = node.end;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(appSourceFile);
  assert.ok(start >= 0 && end > start, `找不到 ${name} 实现`);
  return appSource.slice(start, end);
}

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

test('读取 Android 数字 EXIF GPS 并校验坐标范围', () => {
  assert.deepEqual(photoCoordinatesFromExif({ GPSLatitude: 29.8683, GPSLongitude: 121.544 }), {
    lat: 29.8683,
    lng: 121.544,
  });
  assert.equal(photoCoordinatesFromExif({ GPSLatitude: 95, GPSLongitude: 121.544 }), null);
});

test('读取带方向的 EXIF 度分秒，并选择第一张有定位的照片', () => {
  const coordinates = firstPhotoCoordinates([
    null,
    {
      GPSLatitude: ['33/1', '51/1', '30/1'],
      GPSLatitudeRef: 'S',
      GPSLongitude: '151/1,12/1,30/1',
      GPSLongitudeRef: 'E',
    },
  ]);
  assert.ok(coordinates);
  assert.ok(Math.abs(coordinates.lat - -33.858333333333334) < 1e-10);
  assert.ok(Math.abs(coordinates.lng - 151.20833333333334) < 1e-10);
});

test('新建草稿与编辑使用同一组可编辑字段生成 MemoryV2', () => {
  const created = buildCreatedMemory({
    title: '  ',
    date: '2026-08-24',
    pastSelf: '照片里的那天',
    presentSelf: '',
    location: {
      name: '天一阁', mx: 50, my: 50, lat: 29.874, lng: 121.55, provider: 'amap',
    },
  }, [{ id: 'photo-1', mimeType: 'image/jpeg' }], 'memory-new', '2026-08-24T00:00:00.000Z');

  assert.equal(created.title, '无标题');
  assert.equal(created.category, 'travel');
  assert.equal(created.location?.name, '天一阁');
  assert.deepEqual(created.photos, [{ id: 'photo-1', mimeType: 'image/jpeg' }]);
});

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
  const openMemory = sourceForAppFunction('openMemory');
  assert.match(openMemory, /void loadDetailPhoto\(memory, index, requestId\)/);
  assert.doesNotMatch(openMemory, /await Promise\.all/);
});

test('编辑保存不等待孤立照片清理，避免保存按钮被全库解密阻塞', () => {
  const saveEditedMemory = sourceForAppFunction('saveEditedMemory');
  assert.match(saveEditedMemory, /void cleanupUnreferencedLocalPhotos\(orphanedPhotoIds, nextMemory\.id\)\.catch/);
  assert.doesNotMatch(saveEditedMemory, /await cleanupUnreferencedLocalPhotos/);
});

test('新增照片的缩略图和预览图并行生成并写入', () => {
  const encryptPendingPhoto = sourceForAppFunction('encryptPendingPhoto');
  assert.match(encryptPendingPhoto, /Promise\.all\(PHOTO_VARIANT_SPECS\.map/);
  assert.match(encryptPendingPhoto, /Promise\.all\(encryptedVariants\.map\(saveEncryptedPhoto\)\)/);
});

test('新建和编辑共用草稿保存及并行照片加密路径', () => {
  const saveDraft = sourceForAppFunction('saveEditedMemory');
  assert.match(saveDraft, /draft\.kind === 'create'/);
  assert.match(saveDraft, /for \(const pending of draft\.pendingPhotos\)/);
  assert.match(saveDraft, /encryptPendingPhoto\(session, pending\)/);
  assert.doesNotMatch(saveDraft, /for \(const spec of PHOTO_VARIANT_SPECS\)/);
});

test('正式新建入口使用无限额系统多选并读取 EXIF GPS 后进入共享编辑页', () => {
  const picker = sourceForAppFunction('pickPendingPhotos');
  const beginCreate = sourceForAppFunction('beginCreateMemory');
  const resolveLocation = sourceForAppFunction('resolvePhotoLocation');
  assert.match(picker, /allowsMultipleSelection: true/);
  assert.match(picker, /selectionLimit: 0/);
  assert.match(picker, /exif: true/);
  assert.match(picker, /firstPhotoCoordinates/);
  assert.match(beginCreate, /kind: 'create'/);
  assert.match(beginCreate, /setDraftVisible\(true\)/);
  assert.match(resolveLocation, /convertGps\(coordinates\)/);
  assert.match(resolveLocation, /normalizeLocationResult\(reverse\)/);
  assert.doesNotMatch(appSource, /<Modal visible=\{composerVisible\}/);
});

test('详情浏览优先读取 preview，缺失时回退 thumbnail', () => {
  const loadDetailPhoto = sourceForAppFunction('loadDetailPhoto');
  assert.match(loadDetailPhoto, /readDetailPhotoVariant\(photoId, 'preview'\)/);
  assert.match(loadDetailPhoto, /readDetailPhotoVariant\(photoId, 'thumbnail'\)/);
  assert.doesNotMatch(loadDetailPhoto, /readDetailPhotoVariant\(photoId, 'original'\)/);
  assert.match(loadDetailPhoto, /if \(!encrypted\) \{[\s\S]*?readDetailPhotoVariant\(photoId, 'thumbnail'\)/);
});
