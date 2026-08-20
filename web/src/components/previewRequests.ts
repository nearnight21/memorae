export type PreviewRequestLoader = (photoId: string) => Promise<string>;

export function openMemoryWithPreview<T extends { photoIds?: string[] }>(
  memory: T,
  loadPreview: PreviewRequestLoader | undefined,
  openMemory: (memory: T) => void,
): void {
  const firstPhotoId = memory.photoIds?.[0];
  if (firstPhotoId && loadPreview) {
    void loadPreview(firstPhotoId).catch(() => {
      // Opening the memory must remain available offline or when preview loading fails.
    });
  }
  openMemory(memory);
}

/**
 * Shares an in-flight preview request between effect lifetimes. A rerender may
 * cancel one UI subscriber, but the next subscriber must still receive the
 * same result without starting another download or decrypting another URL.
 */
export function getOrCreatePreviewRequest(
  pendingRequests: Map<string, Promise<string>>,
  photoId: string,
  loadPreview: PreviewRequestLoader,
): Promise<string> {
  const pending = pendingRequests.get(photoId);
  if (pending) return pending;

  const request = loadPreview(photoId);
  pendingRequests.set(photoId, request);
  void request.then(
    () => {
      if (pendingRequests.get(photoId) === request) pendingRequests.delete(photoId);
    },
    () => {
      if (pendingRequests.get(photoId) === request) pendingRequests.delete(photoId);
    },
  );
  return request;
}
