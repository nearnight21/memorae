export type WebRootRoute =
  | 'landing'
  | 'app'
  | 'amap-runtime'
  | 'amap-data-prototype'
  | 'crystal-timeline'
  | 'dev-vault';

export interface RouteResolutionInput {
  hash: string;
  search: string;
  isDev?: boolean;
}

/**
 * 解析 Memorae Web 根入口的目标视图
 *
 * 契约规范：
 * 1. 生产默认 (/) -> 'landing' (官方 Landing Page)
 * 2. 应用直达 (/#app 或 ?app=1) -> 'app' (私密空间与足迹地图)
 * 3. 原型试验 (amap-js-test、crystal-timeline 等既有参数) -> 保持原样直通
 */
export function resolveWebRootRoute({ hash, search, isDev = false }: RouteResolutionInput): WebRootRoute {
  const params = new URLSearchParams(search);

  if (params.get('amap-runtime') === '1') {
    return 'amap-runtime';
  }
  if (params.get('amap-js-test') === '1' && params.get('data') === '1') {
    return 'amap-data-prototype';
  }
  if (isDev && params.get('crystal-timeline') === '1') {
    return 'crystal-timeline';
  }
  if (isDev && params.get('dev-vault') === '1') {
    return 'dev-vault';
  }

  const cleanHash = hash.replace(/^#/, '');
  if (cleanHash === 'app' || cleanHash.startsWith('app/') || cleanHash.startsWith('app?')) {
    return 'app';
  }

  const appParam = params.get('app');
  if (appParam === '1' || appParam === 'true') {
    return 'app';
  }

  return 'landing';
}

/**
 * 平滑直达 Web 核心应用
 */
export function navigateToApp(): void {
  window.location.hash = 'app';
}

/**
 * 平滑返回官方落地页
 */
export function navigateToLanding(): void {
  if (window.location.hash === '#app' || window.location.hash.startsWith('#app')) {
    window.location.hash = '';
  }
  const url = new URL(window.location.href);
  if (url.searchParams.has('app')) {
    url.searchParams.delete('app');
    window.history.replaceState(null, '', url.pathname + (url.search || '') + (url.hash || ''));
  }
}
