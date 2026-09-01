export type MemoraeMapRenderer = 'webview' | 'native-amap';

export function selectMemoraeMapRenderer(
  platform: string,
  configuredRenderer: string | undefined,
): MemoraeMapRenderer {
  return platform === 'android' && configuredRenderer === 'native-amap'
    ? 'native-amap'
    : 'webview';
}

export function nativeAmapPrivacyConsentEnabled(value: string | undefined): boolean {
  return value === '1';
}
