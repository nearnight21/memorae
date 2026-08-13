import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import VaultPrototype from './prototype/VaultPrototype.tsx';
import ProductGate from './product/ProductGate.tsx';
import './index.css';

const CrystalTimelineMapPrototypePage = lazy(
  () => import('./prototype/CrystalTimelineMapPrototypePage.tsx'),
);

const developerParams = new URLSearchParams(window.location.search);
const showDeveloperVault = import.meta.env.DEV && developerParams.get('dev-vault') === '1';
const showCrystalTimelinePrototype = import.meta.env.DEV
  && developerParams.get('crystal-timeline') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showCrystalTimelinePrototype ? (
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
