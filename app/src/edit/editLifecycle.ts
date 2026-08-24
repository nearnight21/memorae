import type { EncryptedMemoryV1 } from '../crypto';
import type { MemoryV2 } from '../memory/memoryV2';
import type { MemoryPhotoV1 } from '../memory/memoryV1';

export interface PhotoManageSelection {
  id: string;
  mimeType: string;
  pending: boolean;
}

export interface EditableMemoryValues {
  title: string;
  date: string;
  pastSelf: string;
  presentSelf: string;
  location: MemoryV2['location'];
}

export function buildCreatedMemory(
  values: EditableMemoryValues,
  photos: MemoryPhotoV1[],
  id: string,
  createdAt: string,
): MemoryV2 {
  return {
    schemaVersion: 2,
    id,
    title: values.title.trim() || '无标题',
    date: values.date,
    category: values.location ? 'travel' : 'growth',
    tag: '',
    pastSelf: values.pastSelf,
    presentSelf: values.presentSelf,
    pinnedBy: 'pin',
    board: { px: 20, py: 20, rotation: 0 },
    location: values.location,
    photos: photos.map((photo) => ({ ...photo })),
    createdAt,
    updatedAt: createdAt,
  };
}

export function buildEditedMemory(
  original: MemoryV2,
  values: EditableMemoryValues,
  photos: MemoryPhotoV1[],
  updatedAt: string,
): MemoryV2 {
  return {
    ...original,
    title: values.title.trim(),
    date: values.date,
    pastSelf: values.pastSelf,
    presentSelf: values.presentSelf,
    location: values.location,
    photos: photos.map((photo) => ({ ...photo })),
    updatedAt,
  };
}

export function createDeleteTombstone(current: EncryptedMemoryV1): EncryptedMemoryV1 {
  if (current.deleted) throw new Error('这条记忆已经被删除。');
  return { ...current, version: current.version + 1, deleted: true };
}

export function removedPhotoIds(
  original: readonly MemoryPhotoV1[],
  next: readonly MemoryPhotoV1[],
): string[] {
  const nextIds = new Set(next.map((photo) => photo.id));
  return original.map((photo) => photo.id).filter((id) => !nextIds.has(id));
}

export function mergePhotoManageSelection<TPending>(
  items: readonly PhotoManageSelection[],
  pendingByKey: ReadonlyMap<string, TPending>,
): { photos: MemoryPhotoV1[]; pendingPhotos: TPending[] } {
  const pendingPhotos = items
    .filter((item) => item.pending)
    .map((item) => pendingByKey.get(item.id))
    .filter((photo): photo is TPending => Boolean(photo));
  return {
    photos: items
      .filter((item) => !item.pending)
      .map(({ id, mimeType }) => ({ id, mimeType })),
    pendingPhotos,
  };
}
