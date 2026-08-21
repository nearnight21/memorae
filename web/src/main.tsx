import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import VaultPrototype from './prototype/VaultPrototype.tsx';
import ProductGate from './product/ProductGate.tsx';
import './index.css';

const CrystalTimelineMapPrototypePage = lazy(
  () => import('./prototype/CrystalTimelineMapPrototypePage.tsx'),
);
const AmapJsPrototype = lazy(() => import('./prototype/AmapJsPrototype.tsx'));

const developerParams = new URLSearchParams(window.location.search);
const showAmapJsPrototype = developerParams.get('amap-js-test') === '1';
const showDeveloperVault = import.meta.env.DEV && developerParams.get('dev-vault') === '1';
const showCrystalTimelinePrototype = import.meta.env.DEV
  && developerParams.get('crystal-timeline') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showAmapJsPrototype ? (
      <Suspense fallback={<div className="vault-loading">正在加载高德 JS API 2.0 测试页</div>}>
        <AmapJsPrototype />
      </Suspense>
    ) : showCrystalTimelinePrototype ? (
      <Suspense fallback={<div className="vault-loading">正在加载真实地图时间轴试验</div>}>
        <CrystalTimelineMapPrototypePage />
      </Suspense>
    ) : showDeveloperVault ? (
      <VaultPrototype />
    ) : (
      <ProductGate />
    )}
  </StrictMode>,
);
