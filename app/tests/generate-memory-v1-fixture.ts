import {
  createVault,
  encryptMemoryV1,
  encryptPhoto,
  type MemoryV1,
} from '../src/crypto';
import { nodeCryptoPrimitives } from './support/nodePrimitives';

const password = 'memory-v1-cross-client-password';
const photoBytes = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2,
  0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 0, 1,
  5, 1, 1, 39, 24, 227, 102, 0, 0, 0, 0, 73, 69, 78, 68, 174,
  66, 96, 130,
]);
const memory: MemoryV1 = {
  schemaVersion: 1,
  id: 'android-memory-v1-001',
  title: 'Android 端的西湖记忆',
  text: '这段文字由 Android 加密，必须能在 Web 恢复。',
  date: '2026-08-10',
  tags: ['杭州', '双端兼容'],
  location: {
    name: '西湖苏堤',
    city: '杭州',
    country: '中国',
    lat: 30.242,
    lng: 120.14,
  },
  photos: [{ id: 'android-photo-v1-001', mimeType: 'image/png' }],
  createdAt: '2026-08-10T05:00:00.000Z',
  updatedAt: '2026-08-10T05:00:00.000Z',
};

async function main(): Promise<void> {
  const { envelope, session } = await createVault(
    nodeCryptoPrimitives,
    password,
    { memoryKiB: 8 * 1024, iterations: 2, parallelism: 1 },
  );
  const encryptedMemory = await encryptMemoryV1(
    nodeCryptoPrimitives,
    session,
    memory,
  );
  const encryptedPhoto = await encryptPhoto(
    nodeCryptoPrimitives,
    session,
    photoBytes,
    { filename: 'android-west-lake.png', mimeType: 'image/png' },
    { id: memory.photos[0].id },
  );

  console.log(JSON.stringify({
    format: 'memory-recall-encrypted-bundle',
    bundleVersion: 1,
    exportedAt: '2026-08-10T05:01:00.000Z',
    vault: envelope,
    memories: [encryptedMemory],
    photos: [encryptedPhoto],
  }, null, 2));
}

void main();
