import * as MediaLibrary from 'expo-media-library/legacy';
import type { PhotoLibraryMetadata } from './photoMetadata';

export function createPhotoLibraryMetadataReader(): (assetId: string) => Promise<PhotoLibraryMetadata | null> {
  let permission: Promise<boolean> | undefined;
  return async (assetId) => {
    permission ??= MediaLibrary.requestPermissionsAsync(false, ['photo'])
      .then((result) => result.granted || result.accessPrivileges === 'limited');
    if (!await permission) return null;
    // SDK 57 的 legacy 实现在 Android 使用 setRequireOriginal 读取未被隐藏的 GPS；
    // 仅按选中的 ID 查询，不扫描相册，也不为元数据额外下载 iCloud 原图。
    return await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false }) ?? null;
  };
}
