import { registerSelectedPhoto } from './photoRegistry';

export async function selectLocalPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
  return registerSelectedPhoto(file);
}
