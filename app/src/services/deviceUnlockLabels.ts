import { Platform } from 'react-native';

export const DEVICE_UNLOCK_LABEL = Platform.OS === 'ios' ? '面容 / 指纹' : '指纹';

export const DEVICE_UNLOCK_STORAGE_LABEL = Platform.OS === 'ios'
  ? '系统钥匙串（Keychain）'
  : 'Android Keystore';
