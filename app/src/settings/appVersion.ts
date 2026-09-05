import * as Application from 'expo-application';
import Constants from 'expo-constants';

export function currentAppVersion(): string {
  return Application.nativeApplicationVersion
    ?? Constants.expoConfig?.version
    ?? '未知';
}

export function currentBuildVersion(): string {
  return Application.nativeBuildVersion
    ?? (Constants.expoConfig?.android?.versionCode !== undefined
      ? String(Constants.expoConfig.android.versionCode)
      : '开发构建');
}
