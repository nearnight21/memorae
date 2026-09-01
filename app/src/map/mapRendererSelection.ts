export type MemoraeMapRenderer = 'webview' | 'native-amap';

export function selectMemoraeMapRenderer(
  platform: string,
  configuredRenderer: string | undefined,
): MemoraeMapRenderer {
  if (platform !== 'android') return 'webview';
  return configuredRenderer?.trim().toLowerCase() === 'webview'
    ? 'webview'
    : 'native-amap';
}

export function nativeAmapPrivacyConsentEnabled(value: string | undefined): boolean {
  return value === '1';
}
