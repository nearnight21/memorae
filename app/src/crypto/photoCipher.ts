import { decodeUtf8, utf8 } from './encoding';
import { assertActiveSession, openBytes, sealBytes } from './vault';
import {
  CRYPTO_VERSION,
  type CryptoPrimitives,
  type SealedBytesV1,
  type VaultSessionV1,
} from './types';

export interface PhotoMetadataV1 {
  filename: string;
  mimeType: string;
  byteLength: number;
}
export interface EncryptedPhotoV1 {
  id: string;
  cryptoVersion: typeof CRYPTO_VERSION;
  kind: 'original' | 'thumbnail';
  metadata: SealedBytesV1;
  content: SealedBytesV1;
}

export interface DecryptedPhotoV1 {
  metadata: PhotoMetadataV1;
  bytes: Uint8Array;
}

function photoAad(
  id: string,
  kind: EncryptedPhotoV1['kind'],
  part: 'metadata' | 'content',
): string {
  return `memory-recall:v1:photo:${id}:${kind}:${part}`;
}

export async function encryptPhoto(
  primitives: CryptoPrimitives,
  session: VaultSessionV1,
  bytes: Uint8Array,
  metadata: Omit<PhotoMetadataV1, 'byteLength'>,
  options: { id?: string; kind?: EncryptedPhotoV1['kind'] } = {},
): Promise<EncryptedPhotoV1> {
  assertActiveSession(session);
  const id = options.id ?? primitives.randomUUID();
  const kind = options.kind ?? 'original';
  const completeMetadata: PhotoMetadataV1 = {
    ...metadata,
    byteLength: bytes.byteLength,
  };

  return {
    id,
    cryptoVersion: CRYPTO_VERSION,
    kind,
    metadata: await sealBytes(
      primitives,
      session.textKey,
      utf8(JSON.stringify(completeMetadata)),
      photoAad(id, kind, 'metadata'),
    ),
    content: await sealBytes(
      primitives,
      session.photoKey,
      bytes,
      photoAad(id, kind, 'content'),
    ),
  };
}

export async function decryptPhoto(
  primitives: CryptoPrimitives,
  session: VaultSessionV1,
  encrypted: EncryptedPhotoV1,
): Promise<DecryptedPhotoV1> {
  assertActiveSession(session);
  if (encrypted.cryptoVersion !== CRYPTO_VERSION) {
    throw new Error('照片密文版本无效。');
  }

  const [metadataBytes, bytes] = await Promise.all([
    openBytes(
      primitives,
      session.textKey,
      encrypted.metadata,
      photoAad(encrypted.id, encrypted.kind, 'metadata'),
    ),
    openBytes(
      primitives,
      session.photoKey,
      encrypted.content,
      photoAad(encrypted.id, encrypted.kind, 'content'),
    ),
  ]);
  const metadata = JSON.parse(decodeUtf8(metadataBytes)) as PhotoMetadataV1;
  if (metadata.byteLength !== bytes.byteLength) {
    throw new Error('照片长度与加密元数据不一致。');
  }
  return { metadata, bytes };
}
