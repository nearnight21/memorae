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
import { DEVICE_UNLOCK_LABEL } from './deviceUnlockLabels';

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

export function canUseDeviceUnlock(): boolean {
  return SecureStore.canUseBiometricAuthentication();
}

export async function enableDeviceUnlock(session: VaultSessionV1): Promise<void> {
  if (!SecureStore.canUseBiometricAuthentication()) {
    throw new Error(`当前设备没有可用的${DEVICE_UNLOCK_LABEL}。`);
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
    await disableDeviceUnlock();
    throw new Error(`本机${DEVICE_UNLOCK_LABEL}凭证已经失效，请使用密码解锁后重新开启。`);
  }

  let record: DeviceUnlockRecordV1;
  try {
    record = JSON.parse(storedRecord) as DeviceUnlockRecordV1;
  } catch {
    await disableDeviceUnlock();
    throw new Error(`本机${DEVICE_UNLOCK_LABEL}凭证已经失效，请使用密码解锁后重新开启。`);
  }
  if (record.schema !== 'memory-recall-device-unlock' || record.cryptoVersion !== 1) {
    await disableDeviceUnlock();
    throw new Error(`本机${DEVICE_UNLOCK_LABEL}凭证已经失效，请使用密码解锁后重新开启。`);
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
