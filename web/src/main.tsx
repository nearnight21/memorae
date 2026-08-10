import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import VaultPrototype from './prototype/VaultPrototype.tsx';
import './index.css';

const LegacyMemoriesApp = lazy(() => import('./App.tsx'));
const showLegacyInterface = new URLSearchParams(window.location.search).get('legacy') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showLegacyInterface ? (
      <Suspense fallback={<div className="vault-loading">正在加载原 Memories 界面</div>}>
        <LegacyMemoriesApp />
      </Suspense>
    ) : (
      <VaultPrototype />
    )}
  </StrictMode>,
);
