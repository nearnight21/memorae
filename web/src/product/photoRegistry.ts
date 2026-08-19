import type { PhotoKind } from '../crypto';

interface RegisteredPhoto {
  file?: File;
  id?: string;
  mimeType: string;
}
const photos = new Map<string, RegisteredPhoto>();
const decryptedVariants = new Map<string, string>();

const variantKey = (id: string, kind: PhotoKind) => `${id}:${kind}`;

export function registerSelectedPhoto(file: File): string {
  const url = URL.createObjectURL(file);
  photos.set(url, { file, mimeType: file.type || 'image/jpeg' });
  return url;
}

export function registerDecryptedPhoto(
  url: string,
  id: string,
  mimeType: string,
  kind?: PhotoKind,
): void {
  photos.set(url, { id, mimeType });
  if (kind) decryptedVariants.set(variantKey(id, kind), url);
}

export function getRegisteredDecryptedPhoto(id: string, kind: PhotoKind): string | undefined {
  return decryptedVariants.get(variantKey(id, kind));
}

export function getRegisteredPhoto(url: string): RegisteredPhoto | undefined {
  return photos.get(url);
}

export function revokeRegisteredPhotos(): void {
  for (const url of photos.keys()) URL.revokeObjectURL(url);
  photos.clear();
  decryptedVariants.clear();
}
