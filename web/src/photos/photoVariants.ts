export interface PhotoVariantSpec {
  kind: 'thumbnail' | 'preview';
  maxDimension: number;
  quality: number;
}

export const PHOTO_VARIANT_SPECS: readonly PhotoVariantSpec[] = [
  { kind: 'thumbnail', maxDimension: 256, quality: 0.72 },
  { kind: 'preview', maxDimension: 1600, quality: 0.82 },
];

export function fitPhotoWithin(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxDimension <= 0) {
    throw new Error('照片尺寸无效。');
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function createJpegPhotoVariant(
  source: File,
  spec: PhotoVariantSpec,
): Promise<Uint8Array> {
  const image = await createImageBitmap(source);
  try {
    const size = fitPhotoWithin(image.width, image.height, spec.maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建照片缩放画布。');
    context.drawImage(image, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('浏览器无法编码照片展示图。')),
        'image/jpeg',
        spec.quality,
      );
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    image.close();
  }
}
