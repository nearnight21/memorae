export type MemoraeMapRenderer = 'webview' | 'native-amap';

export function selectMemoraeMapRenderer(
  platform: string,
  configuredRenderer: string | undefined,
): MemoraeMapRenderer {
  if (platform !== 'android') return 'webview';
  const renderer = configuredRenderer?.trim().toLowerCase();
  return renderer === 'native' || renderer === 'native-amap'
    ? 'native-amap'
    : 'webview';
}

export function nativeAmapPrivacyConsentEnabled(value: string | undefined): boolean {
  return value === '1';
}
