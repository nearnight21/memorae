export type PreviewRequestLoader = (photoId: string) => Promise<string>;

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
