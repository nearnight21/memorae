export interface PrivateSpaceExitStorage {
  disableDeviceUnlock: () => Promise<void>;
  clearEncryptedContent: () => Promise<void>;
  clearStoredAccountSession: () => Promise<void>;
}

/** 调用方须已获得用户确认，并保持当前存储 profile 直到清理完成。 */
export async function clearPrivateSpaceForExit(
  profile: 'cloud' | 'local',
  storage: PrivateSpaceExitStorage,
): Promise<void> {
  await storage.disableDeviceUnlock();
  await storage.clearEncryptedContent();
  // 本地空间与云端账号独立；重置本地空间不应清除另一 profile 的登录态。
  if (profile === 'cloud') await storage.clearStoredAccountSession();
}
