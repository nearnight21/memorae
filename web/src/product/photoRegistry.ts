interface RegisteredPhoto {
  file?: File;
  id?: string;
  mimeType: string;
}
const photos = new Map<string, RegisteredPhoto>();

export function registerSelectedPhoto(file: File): string {
  const url = URL.createObjectURL(file);
  photos.set(url, { file, mimeType: file.type || 'image/jpeg' });
  return url;
}

export function registerDecryptedPhoto(url: string, id: string, mimeType: string): void {
  photos.set(url, { id, mimeType });
}

export function getRegisteredPhoto(url: string): RegisteredPhoto | undefined {
  return photos.get(url);
}

export function revokeRegisteredPhotos(): void {
  for (const url of photos.keys()) URL.revokeObjectURL(url);
  photos.clear();
}
