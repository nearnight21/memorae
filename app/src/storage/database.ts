import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import {
  base64ToBytes,
  bytesToBase64,
  utf8,
  type EncryptedMemoryV1,
  type EncryptedPhotoV1,
  type VaultEnvelopeV1,
} from '../crypto';

const DATABASE_NAME = 'memory-recall-vmk.db';
const PHOTO_DIRECTORY_NAME = 'encrypted-photos-v1';
const VAULT_META_KEY = 'vault-envelope-v1';
const DEVICE_UNLOCK_META_KEY = 'device-unlock-v1';

let databasePromise: Promise<SQLiteDatabase> | null = null;

function encryptedPhotoDirectory(): Directory {
  return new Directory(Paths.document, PHOTO_DIRECTORY_NAME);
}

function photoFileName(photo: Pick<EncryptedPhotoV1, 'id' | 'kind'>): string {
  const safeId = bytesToBase64(utf8(photo.id))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return `${safeId}-${photo.kind}.bin`;
}

async function openDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY NOT NULL,
          encrypted_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS photos (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL,
          crypto_version INTEGER NOT NULL,
          metadata_json TEXT NOT NULL,
          content_iv TEXT NOT NULL,
          content_file TEXT NOT NULL
        );
      `);
      return database;
    });
  }
  return databasePromise;
}

export async function initializeStorage(): Promise<void> {
  await openDatabase();
  const directory = encryptedPhotoDirectory();
  directory.create({ idempotent: true, intermediates: true });
}

export async function getMetadata(key: string): Promise<string | null> {
  const database = await openDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM metadata WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setMetadata(key: string, value: string | null): Promise<void> {
  const database = await openDatabase();
  if (value === null) {
    await database.runAsync('DELETE FROM metadata WHERE key = ?', key);
    return;
  }
  await database.runAsync(
    `INSERT INTO metadata (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function getVaultEnvelope(): Promise<VaultEnvelopeV1 | null> {
  const value = await getMetadata(VAULT_META_KEY);
  return value ? JSON.parse(value) as VaultEnvelopeV1 : null;
}

export async function saveVaultEnvelope(envelope: VaultEnvelopeV1): Promise<void> {
  await setMetadata(VAULT_META_KEY, JSON.stringify(envelope));
}

export async function getDeviceUnlockRecord(): Promise<string | null> {
  return getMetadata(DEVICE_UNLOCK_META_KEY);
}

export async function saveDeviceUnlockRecord(value: string | null): Promise<void> {
  await setMetadata(DEVICE_UNLOCK_META_KEY, value);
}

export async function saveEncryptedMemory(memory: EncryptedMemoryV1): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    `INSERT INTO memories (id, encrypted_json) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET encrypted_json = excluded.encrypted_json`,
    memory.id,
    JSON.stringify(memory),
  );
}

export async function listEncryptedMemories(): Promise<EncryptedMemoryV1[]> {
  const database = await openDatabase();
  const rows = await database.getAllAsync<{ encrypted_json: string }>(
    'SELECT encrypted_json FROM memories ORDER BY rowid DESC',
  );
  return rows.map((row) => JSON.parse(row.encrypted_json) as EncryptedMemoryV1);
}

export async function saveEncryptedPhoto(photo: EncryptedPhotoV1): Promise<void> {
  const directory = encryptedPhotoDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const contentFile = photoFileName(photo);
  const file = new File(directory, contentFile);
  file.create({ overwrite: true, intermediates: true });
  file.write(base64ToBytes(photo.content.ciphertext));

  const database = await openDatabase();
  await database.runAsync(
    `INSERT INTO photos (
       id, kind, crypto_version, metadata_json, content_iv, content_file
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       crypto_version = excluded.crypto_version,
       metadata_json = excluded.metadata_json,
       content_iv = excluded.content_iv,
       content_file = excluded.content_file`,
    photo.id,
    photo.kind,
    photo.cryptoVersion,
    JSON.stringify(photo.metadata),
    photo.content.iv,
    contentFile,
  );
}

interface PhotoRow {
  id: string;
  kind: EncryptedPhotoV1['kind'];
  crypto_version: 1;
  metadata_json: string;
  content_iv: string;
  content_file: string;
}

async function photoFromRow(row: PhotoRow): Promise<EncryptedPhotoV1> {
  const file = new File(encryptedPhotoDirectory(), row.content_file);
  if (!file.exists) {
    throw new Error(`照片密文文件缺失：${row.id}`);
  }
  return {
    id: row.id,
    kind: row.kind,
    cryptoVersion: row.crypto_version,
    metadata: JSON.parse(row.metadata_json) as EncryptedPhotoV1['metadata'],
    content: {
      algorithm: 'AES-256-GCM',
      iv: row.content_iv,
      ciphertext: bytesToBase64(await file.bytes()),
    },
  };
}

export async function getEncryptedPhoto(id: string): Promise<EncryptedPhotoV1 | null> {
  const database = await openDatabase();
  const row = await database.getFirstAsync<PhotoRow>(
    'SELECT * FROM photos WHERE id = ?',
    id,
  );
  return row ? photoFromRow(row) : null;
}

export async function listEncryptedPhotos(): Promise<EncryptedPhotoV1[]> {
  const database = await openDatabase();
  const rows = await database.getAllAsync<PhotoRow>('SELECT * FROM photos ORDER BY rowid DESC');
  return Promise.all(rows.map(photoFromRow));
}

export async function clearEncryptedContent(): Promise<void> {
  const database = await openDatabase();
  await database.withTransactionAsync(async () => {
    await database.execAsync('DELETE FROM memories; DELETE FROM photos; DELETE FROM metadata;');
  });

  const directory = encryptedPhotoDirectory();
  if (directory.exists) {
    directory.delete();
  }
  directory.create({ idempotent: true, intermediates: true });
}
