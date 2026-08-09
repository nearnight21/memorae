import * as SecureStore from 'expo-secure-store';
import {
  base64ToBytes,
  bytesToBase64,
  openBytes,
  sealBytes,
  sessionFromVmk,
  type SealedBytesV1,
  type VaultEnvelopeV1,
  type VaultSessionV1,
} from '../crypto';
import { nativeCryptoPrimitives } from '../crypto/nativePrimitives';
import {
  getDeviceUnlockRecord,
  saveDeviceUnlockRecord,
} from '../storage/database';

const DEVICE_KEY_NAME = 'memory-recall.device-key.v1';
const DEVICE_VMK_AAD = 'memory-recall:v1:device:vmk';
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: '验证身份以解锁私密空间',
};

interface DeviceUnlockRecordV1 {
  schema: 'memory-recall-device-unlock';
  cryptoVersion: 1;
  wrappedVmk: SealedBytesV1;
}
export async function hasDeviceUnlock(): Promise<boolean> {
  return (await getDeviceUnlockRecord()) !== null;
}

export async function enableDeviceUnlock(session: VaultSessionV1): Promise<void> {
  if (!SecureStore.canUseBiometricAuthentication()) {
    throw new Error('当前设备没有可用的指纹或安全生物识别。');
  }
  const deviceKey = await nativeCryptoPrimitives.randomBytes(32);
  try {
    const record: DeviceUnlockRecordV1 = {
      schema: 'memory-recall-device-unlock',
      cryptoVersion: 1,
      wrappedVmk: await sealBytes(
        nativeCryptoPrimitives,
        deviceKey,
        session.vmk,
        DEVICE_VMK_AAD,
      ),
    };
    await SecureStore.setItemAsync(
      DEVICE_KEY_NAME,
      bytesToBase64(deviceKey),
      secureStoreOptions,
    );
    await saveDeviceUnlockRecord(JSON.stringify(record));
  } catch (error) {
    await SecureStore.deleteItemAsync(DEVICE_KEY_NAME, secureStoreOptions).catch(() => undefined);
    throw error;
  } finally {
    deviceKey.fill(0);
  }
}

export async function unlockWithDevice(
  envelope: VaultEnvelopeV1,
): Promise<VaultSessionV1> {
  const [storedKey, storedRecord] = await Promise.all([
    SecureStore.getItemAsync(DEVICE_KEY_NAME, secureStoreOptions),
    getDeviceUnlockRecord(),
  ]);
  if (!storedKey || !storedRecord) {
    throw new Error('本机解锁凭证不存在或已经失效，请使用密码。');
  }
  const record = JSON.parse(storedRecord) as DeviceUnlockRecordV1;
  if (record.schema !== 'memory-recall-device-unlock' || record.cryptoVersion !== 1) {
    throw new Error('本机解锁凭证格式无效，请使用密码。');
  }

  const deviceKey = base64ToBytes(storedKey);
  try {
    const vmk = await openBytes(
      nativeCryptoPrimitives,
      deviceKey,
      record.wrappedVmk,
      DEVICE_VMK_AAD,
    );
    return sessionFromVmk(nativeCryptoPrimitives, envelope, vmk);
  } finally {
    deviceKey.fill(0);
  }
}

export async function disableDeviceUnlock(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(DEVICE_KEY_NAME, secureStoreOptions).catch(() => undefined),
    saveDeviceUnlockRecord(null),
  ]);
}
