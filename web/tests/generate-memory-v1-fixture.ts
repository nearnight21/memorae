import {
  createVault,
  encryptMemoryV1,
  encryptPhoto,
  type MemoryV1,
} from '../src/crypto';

const password = 'memory-v1-cross-client-password';
const photoBytesBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const photoBytes = Uint8Array.from(atob(photoBytesBase64), (character) => character.charCodeAt(0));
const memory: MemoryV1 = {
  schemaVersion: 1,
  id: 'web-memory-v1-001',
  title: '网页端的西湖记忆',
  text: '这段文字由 Web 加密，必须能在 Android 恢复。',
  date: '2026-08-10',
  tags: ['杭州', '双端兼容'],
  location: {
    name: '西湖断桥',
    city: '杭州',
    country: '中国',
    lat: 30.259,
    lng: 120.148,
  },
  photos: [{ id: 'web-photo-v1-001', mimeType: 'image/png' }],
  createdAt: '2026-08-10T04:00:00.000Z',
  updatedAt: '2026-08-10T04:00:00.000Z',
};

const { envelope, session } = await createVault(password, {
  memoryKiB: 8 * 1024,
  iterations: 2,
  parallelism: 1,
});
const encryptedMemory = await encryptMemoryV1(session, memory);
const encryptedPhoto = await encryptPhoto(
  session,
  photoBytes,
  { filename: 'web-west-lake.png', mimeType: 'image/png' },
  { id: memory.photos[0].id },
);

console.log(JSON.stringify({
  format: 'memory-recall-encrypted-bundle',
  bundleVersion: 1,
  exportedAt: '2026-08-10T04:01:00.000Z',
  vault: envelope,
  memories: [encryptedMemory],
  photos: [encryptedPhoto],
}, null, 2));
