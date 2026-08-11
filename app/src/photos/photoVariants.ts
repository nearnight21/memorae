import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

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
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
  spec: PhotoVariantSpec,
): Promise<Uint8Array> {
  const size = fitPhotoWithin(sourceWidth, sourceHeight, spec.maxDimension);
  const context = ImageManipulator.manipulate(sourceUri);
  if (size.width !== sourceWidth || size.height !== sourceHeight) {
    context.resize({ width: size.width, height: size.height });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: spec.quality,
    format: SaveFormat.JPEG,
  });
  const file = new File(result.uri);
  try {
    return await file.bytes();
  } finally {
    if (file.exists) file.delete();
  }
}
