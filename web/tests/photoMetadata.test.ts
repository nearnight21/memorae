import assert from 'node:assert/strict';
import test from 'node:test';
import { readPhotoMetadata } from '../src/product/photoMetadata';

function jpegWithExif(): Blob {
  const bytes = new Uint8Array(220);
  const view = new DataView(bytes.buffer);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  bytes.set([0xff, 0xd8, 0xff, 0xe1], 0);
  // APP1 length includes the two length bytes.
  view.setUint16(4, 196, false);
  bytes.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6);
  bytes.set([0x49, 0x49, 0x2a, 0x00], 12);
  u32(16, 8);

  // TIFF IFD at offset 8: DateTimeOriginal and GPSInfoPointer.
  u16(20, 2);
  u16(22, 0x9003); u16(24, 2); u32(26, 20); u32(30, 52);
  u16(34, 0x8825); u16(36, 4); u32(38, 1); u32(42, 72);
  u32(46, 0);
  bytes.set(new TextEncoder().encode('2024:06:18 12:34:56\0'), 64);

  // GPS IFD at TIFF offset 72.
  u16(84, 4);
  u16(86, 1); u16(88, 2); u32(90, 2); bytes.set([0x4e, 0], 94);
  u16(98, 2); u16(100, 5); u32(102, 3); u32(106, 128);
  u16(110, 3); u16(112, 2); u32(114, 2); bytes.set([0x45, 0], 118);
  u16(122, 4); u16(124, 5); u32(126, 3); u32(130, 152);
  u32(134, 0);
  // 35° 39' 0" N, 139° 41' 0" E.
  u32(140, 35); u32(144, 1); u32(148, 39); u32(152, 1); u32(156, 0); u32(160, 1);
  u32(164, 139); u32(168, 1); u32(172, 41); u32(176, 1); u32(180, 0); u32(184, 1);
  return new Blob([bytes], { type: 'image/jpeg' });
}

test('从 JPEG EXIF 读取拍摄日期与 GPS 坐标', async () => {
  const metadata = await readPhotoMetadata(jpegWithExif());
  assert.equal(metadata.date, '2024-06-18');
  assert.equal(metadata.latitude, 35.65);
  assert.equal(metadata.longitude, 139.68333333333334);
});

test('没有 EXIF 的图片返回空元数据', async () => {
  const metadata = await readPhotoMetadata(new Blob(['not an image'], { type: 'image/jpeg' }));
  assert.deepEqual(metadata, {});
});
