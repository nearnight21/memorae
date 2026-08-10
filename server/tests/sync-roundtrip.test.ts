import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { MemoryV1 } from '../../memory-recall-mobile/src/memory/memoryV1.ts';
import { buildApp } from '../src/app.ts';
import { JsonCipherStore } from '../src/store.ts';

const LOCAL_TOKEN = 'local-test-token-at-least-16-chars';
const PASSWORD = 'private-space-test-password';
const TEST_KDF = {
  memoryKiB: 8 * 1024,
  iterations: 2,
  parallelism: 1,
};

const memory: MemoryV1 = {
  schemaVersion: 1,
  id: 'memory-server-sync-001',
  title: 'West Lake after the rain',
  text: 'This private sentence must never be stored by the server as plaintext.',
  date: '2026-08-10',
  tags: ['Hangzhou', 'walk'],
  location: {
    name: 'Broken Bridge by West Lake',
    city: 'Hangzhou',
    country: 'China',
    lat: 30.259,
    lng: 120.148,
  },
  photos: [{ id: 'photo-server-sync-001', mimeType: 'image/png' }],
  createdAt: '2026-08-10T10:00:00.000Z',
  updatedAt: '2026-08-10T10:00:00.000Z',
};

const webMemory: MemoryV1 = {
  ...memory,
  id: 'memory-server-sync-002',
  title: 'A memory written on the Web',
  text: 'This second private sentence travels from Web to Android.',
  location: {
    ...memory.location!,
    name: 'Leifeng Pagoda by West Lake',
  },
  photos: [{ id: 'photo-server-sync-002', mimeType: 'image/png' }],
  createdAt: '2026-08-10T11:00:00.000Z',
  updatedAt: '2026-08-10T11:00:00.000Z',
};

test('Android and Web exchange ciphertext through the server in both directions', async (context) => {
  // Keep client imports runtime-dynamic so each project remains typechecked by
  // its own TypeScript setup while this integration test still runs both.
  const androidCryptoModulePath = '../../memory-recall-mobile/src/crypto/index.ts';
  const androidSyncModulePath = '../../memory-recall-mobile/src/sync/syncClient.ts';
  const nodePrimitivesModulePath = '../../memory-recall-mobile/tests/support/nodePrimitives.ts';
  const webCryptoModulePath = '../../memory-recall-web/src/crypto/index.ts';
  const webSyncModulePath = '../../memory-recall-web/src/sync/syncClient.ts';
  const androidCryptoNamespace = await import(androidCryptoModulePath);
  const androidSyncNamespace = await import(androidSyncModulePath);
  const nodePrimitivesNamespace = await import(nodePrimitivesModulePath);
  const androidCrypto = androidCryptoNamespace.default ?? androidCryptoNamespace;
  const androidSync = androidSyncNamespace.default ?? androidSyncNamespace;
  const nodePrimitives = nodePrimitivesNamespace.default ?? nodePrimitivesNamespace;
  const {
    createVault: createAndroidVault,
    decryptMemoryV1: decryptAndroidMemoryV1,
    decryptPhoto: decryptAndroidPhoto,
    encryptMemoryV1: encryptAndroidMemoryV1,
    encryptPhoto: encryptAndroidPhoto,
    unlockVault: unlockAndroidVault,
  } = androidCrypto;
  const { MemoryRecallSyncClient: AndroidSyncClient } = androidSync;
  const { nodeCryptoPrimitives } = nodePrimitives;
  const {
    decryptMemoryV1: decryptWebMemoryV1,
    decryptPhoto: decryptWebPhoto,
    encryptMemoryV1: encryptWebMemoryV1,
    encryptPhoto: encryptWebPhoto,
    unlockVault: unlockWebVault,
  } = await import(webCryptoModulePath);
  const { MemoryRecallSyncClient: WebSyncClient } = await import(webSyncModulePath);
  const directory = await mkdtemp(join(tmpdir(), 'memory-recall-server-'));
  const dataFile = join(directory, 'store.json');
  const app = await buildApp({
    store: new JsonCipherStore(dataFile),
    localToken: LOCAL_TOKEN,
  });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const android = new AndroidSyncClient({ baseUrl, token: LOCAL_TOKEN });
  const web = new WebSyncClient({ baseUrl, token: LOCAL_TOKEN });
  const photoBytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5, 6, 7, 8,
  ]);
  const photoFilename = 'private-west-lake-photo.png';

  const androidVault = await createAndroidVault(
    nodeCryptoPrimitives,
    PASSWORD,
    TEST_KDF,
  );
  const encryptedMemory = await encryptAndroidMemoryV1(
    nodeCryptoPrimitives,
    androidVault.session,
    memory,
  );
  const encryptedPhoto = await encryptAndroidPhoto(
    nodeCryptoPrimitives,
    androidVault.session,
    photoBytes,
    { filename: photoFilename, mimeType: 'image/png' },
    { id: memory.photos[0].id },
  );

  await android.putVault(androidVault.envelope);
  await android.putMemory(encryptedMemory);
  await android.putPhoto(encryptedPhoto);

  const downloadedVault = await web.getVault();
  const downloadedMemories = await web.listMemories();
  const downloadedPhoto = await web.getPhoto(encryptedPhoto.id);
  const webSession = await unlockWebVault(downloadedVault, PASSWORD);
  const decryptedMemory = await decryptWebMemoryV1(
    webSession,
    downloadedMemories[0],
  );
  const decryptedPhoto = await decryptWebPhoto(webSession, downloadedPhoto);

  assert.deepEqual(decryptedMemory.memory, memory);
  assert.deepEqual(decryptedPhoto.bytes, photoBytes);
  assert.deepEqual(decryptedPhoto.metadata, {
    filename: photoFilename,
    mimeType: 'image/png',
    byteLength: photoBytes.byteLength,
  });

  const webPhotoBytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 9, 10, 11, 12, 13, 14, 15, 16,
  ]);
  const webPhotoFilename = 'private-web-memory-photo.png';
  const webEncryptedMemory = await encryptWebMemoryV1(webSession, webMemory);
  const webEncryptedPhoto = await encryptWebPhoto(
    webSession,
    webPhotoBytes,
    { filename: webPhotoFilename, mimeType: 'image/png' },
    { id: webMemory.photos[0].id },
  );

  await web.putVault(downloadedVault);
  await web.putMemory(webEncryptedMemory);
  await web.putPhoto(webEncryptedPhoto);

  const androidDownloadedVault = await android.getVault();
  const androidDownloadedMemories = await android.listMemories();
  const androidDownloadedMemory = androidDownloadedMemories.find(
    (item: { id: string }) => item.id === webMemory.id,
  );
  assert.ok(androidDownloadedMemory);
  const androidDownloadedPhoto = await android.getPhoto(webEncryptedPhoto.id);
  const androidSession = await unlockAndroidVault(
    nodeCryptoPrimitives,
    androidDownloadedVault,
    PASSWORD,
  );
  const androidDecryptedMemory = await decryptAndroidMemoryV1(
    nodeCryptoPrimitives,
    androidSession,
    androidDownloadedMemory,
  );
  const androidDecryptedPhoto = await decryptAndroidPhoto(
    nodeCryptoPrimitives,
    androidSession,
    androidDownloadedPhoto,
  );

  assert.deepEqual(androidDecryptedMemory.memory, webMemory);
  assert.deepEqual(androidDecryptedPhoto.bytes, webPhotoBytes);
  assert.deepEqual(androidDecryptedPhoto.metadata, {
    filename: webPhotoFilename,
    mimeType: 'image/png',
    byteLength: webPhotoBytes.byteLength,
  });

  const persistedCiphertext = await readFile(dataFile, 'utf8');
  for (const plaintext of [
    memory.title,
    memory.text,
    memory.location?.name ?? '',
    photoFilename,
    Buffer.from(photoBytes).toString('base64'),
    webMemory.title,
    webMemory.text,
    webMemory.location?.name ?? '',
    webPhotoFilename,
    Buffer.from(webPhotoBytes).toString('base64'),
  ]) {
    assert.equal(persistedCiphertext.includes(plaintext), false);
  }

  const reopenedStore = new JsonCipherStore(dataFile);
  assert.deepEqual(await reopenedStore.getVault('local-user'), androidVault.envelope);
  assert.deepEqual(await reopenedStore.listMemories('local-user'), [
    encryptedMemory,
    webEncryptedMemory,
  ]);
  assert.deepEqual(
    await reopenedStore.getPhoto('local-user', encryptedPhoto.id),
    encryptedPhoto,
  );
  assert.deepEqual(
    await reopenedStore.getPhoto('local-user', webEncryptedPhoto.id),
    webEncryptedPhoto,
  );

  const unauthorized = await fetch(`${baseUrl}/v1/memories`, {
    headers: { authorization: 'Bearer wrong-token' },
  });
  assert.equal(unauthorized.status, 401);

  const plaintextRejected = await fetch(`${baseUrl}/v1/memories/${memory.id}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${LOCAL_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...encryptedMemory, title: memory.title }),
  });
  assert.equal(plaintextRejected.status, 400);
});
