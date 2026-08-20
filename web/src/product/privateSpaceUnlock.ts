import { unlockVault, VaultUnlockError, type VaultEnvelopeV1, type VaultSessionV1 } from '../crypto';
import { VaultMismatchError } from '../sync/syncActions';

export const PRIVATE_SPACE_PASSWORD_ERROR = '密码不正确，无法解锁私密空间';
export const PRIVATE_SPACE_VAULT_MISMATCH_ERROR = '当前设备的私密空间信息与云端不一致，请停止操作并检查设备';
export const PRIVATE_SPACE_NETWORK_ERROR = '暂时无法获取私密空间信息，请稍后重试';

/** 私密空间密码只参与本机密钥信封解锁，不进入任何网络或持久化调用。 */
export function unlockPrivateSpaceLocally(
  envelope: VaultEnvelopeV1,
  password: string,
): Promise<VaultSessionV1> {
  return unlockVault(envelope, password);
}

export function privateSpaceUnlockErrorMessage(error: unknown): string {
  if (error instanceof VaultMismatchError) return PRIVATE_SPACE_VAULT_MISMATCH_ERROR;
  if (error instanceof VaultUnlockError) return PRIVATE_SPACE_PASSWORD_ERROR;
  return PRIVATE_SPACE_NETWORK_ERROR;
}
