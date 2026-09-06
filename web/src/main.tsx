/**
 * =========================================================================
 * Memorae Web 统一入口路由契约 (SSOT)
 * =========================================================================
 * 1. 默认根路径 (/) : 官方 Landing Page (纯展示、无重型加密库与地图包)
 * 2. 应用核心区 (/#app 或 ?app=1) : 私密空间门禁与足迹应用 (ProductGate)
 * 3. 开发者原型 (amap-js-test、crystal-timeline、dev-vault) : 原样保持直通
 * 4. 路由变更 : 支持 hashchange 平滑切换，无需刷新重载
 * =========================================================================
 */

import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import VaultPrototype from './prototype/VaultPrototype.tsx';
import ProductGate from './product/ProductGate.tsx';
import { loadProductLocations } from './product/productStore';
import { resolveWebRootRoute, navigateToApp, navigateToLanding, type WebRootRoute } from './landing/landingRouting.ts';
import './index.css';

const LandingPage = lazy(() => import('./landing/LandingPage.tsx'));
const CrystalTimelineMapPrototypePage = lazy(
  () => import('./prototype/CrystalTimelineMapPrototypePage.tsx'),
);
const AmapJsDataPrototype = lazy(() => import('./prototype/AmapJsDataPrototype.tsx'));
const AmapJsRuntime = lazy(() => import('./prototype/AmapJsRuntime.tsx'));

const developerParams = new URLSearchParams(window.location.search);
const showAmapJsDataPrototype = developerParams.get('amap-js-test') === '1'
  && developerParams.get('data') === '1';
const showAmapJsRuntime = developerParams.get('amap-runtime') === '1';
const showDeveloperVault = import.meta.env.DEV && developerParams.get('dev-vault') === '1';
const showCrystalTimelinePrototype = import.meta.env.DEV
  && developerParams.get('crystal-timeline') === '1';

function getInitialRoute(): WebRootRoute {
  if (typeof window === 'undefined') {
    return 'landing';
  }
  return resolveWebRootRoute({
    hash: window.location.hash,
    search: window.location.search,
    isDev: import.meta.env.DEV,
  });
}

function RootApp() {
  const [route, setRoute] = useState<WebRootRoute>(getInitialRoute);

  useEffect(() => {
    const handleNavigation = () => {
      setRoute(
        resolveWebRootRoute({
          hash: window.location.hash,
          search: window.location.search,
          isDev: import.meta.env.DEV,
        }),
      );
    };

    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);
    return () => {
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
    };
  }, []);

  return (
    <>
      {showAmapJsRuntime || route === 'amap-runtime' ? (
        <Suspense fallback={<div className="vault-loading">正在加载地图 Runtime</div>}>
          <AmapJsRuntime />
        </Suspense>
      ) : showAmapJsDataPrototype || route === 'amap-data-prototype' ? (
        <Suspense fallback={<div className="vault-loading">正在加载高德真实数据测试页</div>}>
          <ProductGate
            loadUnlockedMemories={loadProductLocations}
            syncPhotosOnUnlock={false}
            unlockedRenderer={({ initialMemories, onLock }) => (
              <AmapJsDataPrototype memories={initialMemories} onLock={onLock} />
            )}
          />
        </Suspense>
      ) : showCrystalTimelinePrototype || route === 'crystal-timeline' ? (
        <Suspense fallback={<div className="vault-loading">正在加载真实地图时间轴试验</div>}>
          <CrystalTimelineMapPrototypePage />
        </Suspense>
      ) : showDeveloperVault || route === 'dev-vault' ? (
        <VaultPrototype />
      ) : route === 'app' ? (
        <ProductGate />
      ) : (
        <Suspense fallback={<div className="vault-loading">正在加载所忆...</div>}>
          <LandingPage onEnterApp={navigateToApp} />
        </Suspense>
      )}

      {import.meta.env.DEV && (
        <div
          style={{
            position: 'fixed',
            bottom: '12px',
            left: '12px',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(25, 23, 22, 0.85)',
            color: '#f5f2eb',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontFamily: 'monospace',
          }}
        >
          <span style={{ opacity: 0.7 }}>DEV: {route}</span>
          <button
            type="button"
            onClick={() => {
              if (route === 'landing') {
                navigateToApp();
              } else {
                navigateToLanding();
              }
            }}
            style={{
              background: '#D97706',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 8px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            {route === 'landing' ? '切换到 App (/#app)' : '切换到 Landing (/)'}
          </button>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
