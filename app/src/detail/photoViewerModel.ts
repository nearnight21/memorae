export const PHOTO_VIEWER_MIN_SCALE = 1;
export const PHOTO_VIEWER_MAX_SCALE = 4;

export interface PhotoViewerPoint {
  x: number;
  y: number;
}

export function clampPhotoViewerScale(scale: number): number {
  return Math.min(PHOTO_VIEWER_MAX_SCALE, Math.max(PHOTO_VIEWER_MIN_SCALE, scale));
}

export function photoViewerPanBounds(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
  scale: number,
): PhotoViewerPoint {
  if (canvasWidth <= 0 || canvasHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0 };
  }
  const fittedScale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const fittedWidth = imageWidth * fittedScale;
  const fittedHeight = imageHeight * fittedScale;
  return {
    x: Math.max(0, (fittedWidth * clampPhotoViewerScale(scale) - canvasWidth) / 2),
    y: Math.max(0, (fittedHeight * clampPhotoViewerScale(scale) - canvasHeight) / 2),
  };
}

export function clampPhotoViewerTranslation(
  translation: PhotoViewerPoint,
  bounds: PhotoViewerPoint,
): PhotoViewerPoint {
  return {
    x: Math.min(bounds.x, Math.max(-bounds.x, translation.x)),
    y: Math.min(bounds.y, Math.max(-bounds.y, translation.y)),
  };
}
