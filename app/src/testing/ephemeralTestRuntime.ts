import {
  CRYPTO_VERSION,
  FROZEN_KDF_DEFAULTS,
  VAULT_SCHEMA,
  base64ToBytes,
  bytesToBase64,
  destroyVaultSession,
  encryptMemoryV2,
  encryptPhoto,
  sealBytes,
  type CryptoPrimitives,
  type EncryptedMemoryV1,
  type EncryptedPhotoV1,
  type MemoryV2,
  type PhotoKind,
  type VaultEnvelopeV1,
  type VaultSessionV1,
} from '../crypto';
import {
  MemoryRecallSyncClient,
  PhotoVariantNotFoundError,
  SyncRequestError,
} from '../sync/syncClient';
import {
  uploadCiphertext,
  type CipherSyncStorage,
} from '../sync/syncActions';

const TEST_VMK_AAD = 'memory-recall:v1:key:vmk';
const TEST_TEXT_KEY_AAD = 'memory-recall:v1:key:text';
const TEST_PHOTO_KEY_AAD = 'memory-recall:v1:key:photo';
const TEST_PIXEL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZqGQAAAAASUVORK5CYII=';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class EphemeralSyncClient extends MemoryRecallSyncClient {
  private vault: VaultEnvelopeV1 | null = null;
  private readonly memories = new Map<string, EncryptedMemoryV1>();
  private readonly photos = new Map<string, EncryptedPhotoV1>();

  constructor() {
    super({ baseUrl: 'http://127.0.0.1', token: 'ephemeral-test' });
  }

  override async putVault(vault: VaultEnvelopeV1): Promise<void> {
    this.vault = clone(vault);
  }

  override async getVault(): Promise<VaultEnvelopeV1> {
    if (!this.vault) throw new SyncRequestError(404, '临时测试远端还没有钥匙信封。');
    return clone(this.vault);
  }

  override async putMemory(memory: EncryptedMemoryV1): Promise<void> {
    this.memories.set(memory.id, clone(memory));
  }

  override async listMemories(): Promise<EncryptedMemoryV1[]> {
    return [...this.memories.values()].map(clone);
  }

  override async putPhoto(photo: EncryptedPhotoV1): Promise<void> {
    await this.putPhotoVariant(photo);
  }

  override async putPhotoVariant(photo: EncryptedPhotoV1): Promise<void> {
    this.photos.set(`${photo.id}:${photo.kind}`, clone(photo));
  }

  override async getPhoto(photoId: string): Promise<EncryptedPhotoV1> {
    return this.getPhotoVariant(photoId, 'original');
  }

  override async getPhotoVariant(photoId: string, kind: PhotoKind): Promise<EncryptedPhotoV1> {
    const photo = this.photos.get(`${photoId}:${kind}`);
    if (!photo) throw new PhotoVariantNotFoundError();
    return clone(photo);
  }

  override async logout(): Promise<void> {
    // The remote exists only in this process and disappears with the test app.
  }
}

export interface EphemeralTestBootstrap {
  client: MemoryRecallSyncClient;
  envelope: VaultEnvelopeV1;
  session: VaultSessionV1;
  uploadedMemories: number;
  uploadedPhotos: number;
}

async function createPasswordlessVault(
  primitives: CryptoPrimitives,
): Promise<{ envelope: VaultEnvelopeV1; session: VaultSessionV1 }> {
  const [vmk, textKey, photoKey, discardedUnlockKey, salt] = await Promise.all([
    primitives.randomBytes(32),
    primitives.randomBytes(32),
    primitives.randomBytes(32),
    primitives.randomBytes(32),
    primitives.randomBytes(16),
  ]);
  try {
    const envelope: VaultEnvelopeV1 = {
      schema: VAULT_SCHEMA,
      cryptoVersion: CRYPTO_VERSION,
      createdAt: new Date().toISOString(),
      kdf: {
        name: 'Argon2id',
        salt: bytesToBase64(salt),
        ...FROZEN_KDF_DEFAULTS,
      },
      wrappedVmk: await sealBytes(primitives, discardedUnlockKey, vmk, TEST_VMK_AAD),
      wrappedKeys: {
        text: await sealBytes(primitives, vmk, textKey, TEST_TEXT_KEY_AAD),
        photo: await sealBytes(primitives, vmk, photoKey, TEST_PHOTO_KEY_AAD),
      },
    };
    return {
      envelope,
      session: {
        cryptoVersion: CRYPTO_VERSION,
        vmk,
        textKey,
        photoKey,
        destroyed: false,
      },
    };
  } catch (error) {
    vmk.fill(0);
    textKey.fill(0);
    photoKey.fill(0);
    throw error;
  } finally {
    discardedUnlockKey.fill(0);
    salt.fill(0);
  }
}

function sampleMemories(): MemoryV2[] {
  const timestamp = '2026-08-25T08:00:00.000Z';
  const samples = [
    ['test-ningbo-2026', '宁波 · 今年', '2026-05-18', 29.8683, 121.544, '浙江省', '宁波市', '海曙区'],
    ['test-ningbo-2024', '宁波 · 两年前', '2024-10-02', 29.8683, 121.544, '浙江省', '宁波市', '海曙区'],
    ['test-ningbo-2022', '宁波 · 城市下钻', '2022-04-12', 29.815, 121.555, '浙江省', '宁波市', '鄞州区'],
    ['test-hangzhou-2020', '杭州 · 单条城市', '2020-09-20', 30.2741, 120.1551, '浙江省', '杭州市', '西湖区'],
    ['test-shanghai-2018', '上海 · 省级单条', '2018-11-03', 31.2304, 121.4737, '上海市', '上海市', '黄浦区'],
  ] as const;
  return samples.map(([id, title, date, lat, lng, province, city, district], index) => ({
    schemaVersion: 2,
    id,
    title,
    date,
    category: 'travel',
    tag: '测试记忆',
    pastSelf: index < 3
      ? '用于验证浙江省 → 宁波市 → 单条记忆的三级点击。'
      : '用于验证只有一条记忆时直接进入详情。',
    presentSelf: '这段内容由测试包在本机真实加密，下载后再解密显示。',
    pinnedBy: 'pin',
    board: { px: 18 + index * 12, py: 24 + index * 8, rotation: 0 },
    location: {
      name: `${city.replace(/市$/u, '')} · ${district}`,
      country: '中国',
      province,
      city,
      district,
      lat,
      lng,
      mx: 50,
      my: 50,
      provider: 'ephemeral-test',
    },
    photos: [{ id: `${id}-photo`, mimeType: 'image/png' }],
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

function sourceStorage(
  envelope: VaultEnvelopeV1,
  memories: EncryptedMemoryV1[],
  photos: EncryptedPhotoV1[],
): CipherSyncStorage {
  const memoriesById = new Map(memories.map((memory) => [memory.id, memory]));
  const photosByRef = new Map(photos.map((photo) => [`${photo.id}:${photo.kind}`, photo]));
  return {
    getVault: async () => envelope,
    saveVault: async () => undefined,
    listMemories: async () => [...memoriesById.values()],
    getMemory: async (id) => memoriesById.get(id) ?? null,
    listPhotos: async () => [...photosByRef.values()],
    listPhotoRefs: async () => [...photosByRef.values()].map(({ id, kind }) => ({ id, kind })),
    getPhoto: async (id, kind) => photosByRef.get(`${id}:${kind}`) ?? null,
    saveMemory: async () => undefined,
    savePhoto: async () => undefined,
  };
}

export async function createEphemeralTestBootstrap(
  primitives: CryptoPrimitives,
): Promise<EphemeralTestBootstrap> {
  const { envelope, session } = await createPasswordlessVault(primitives);
  const photoBytes = base64ToBytes(TEST_PIXEL_PNG_BASE64);
  try {
    const samples = sampleMemories();
    const memories = await Promise.all(samples.map((memory) => (
      encryptMemoryV2(primitives, session, memory)
    )));
    const photos: EncryptedPhotoV1[] = [];
    for (const memory of samples) {
      const photo = memory.photos[0];
      for (const kind of ['thumbnail', 'preview', 'original'] as const) {
        photos.push(await encryptPhoto(
          primitives,
          session,
          photoBytes,
          { filename: `${photo.id}.png`, mimeType: photo.mimeType },
          { id: photo.id, kind },
        ));
      }
    }
    const client = new EphemeralSyncClient();
    const uploaded = await uploadCiphertext(
      client,
      sourceStorage(envelope, memories, photos),
    );
    return {
      client,
      envelope,
      session,
      uploadedMemories: uploaded.memories,
      uploadedPhotos: uploaded.photos,
    };
  } catch (error) {
    destroyVaultSession(session);
    throw error;
  } finally {
    photoBytes.fill(0);
  }
}

export const EPHEMERAL_TEST_REMOTE_LABEL = '包内临时同步区';
