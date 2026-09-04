import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import VaultPrototype from './prototype/VaultPrototype.tsx';
import ProductGate from './product/ProductGate.tsx';
import { loadProductLocations } from './product/productStore';
import './index.css';

import AmapJsDataPrototype from './prototype/AmapJsDataPrototype.tsx';
import AmapJsRuntime from './prototype/AmapJsRuntime.tsx';

const developerParams = new URLSearchParams(window.location.search);
const showAmapJsDataPrototype = developerParams.get('amap-js-test') === '1'
  && developerParams.get('data') === '1';
const showAmapJsRuntime = developerParams.get('amap-runtime') === '1';
const showDeveloperVault = import.meta.env.DEV && developerParams.get('dev-vault') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showAmapJsRuntime ? (
        <AmapJsRuntime />
    ) : showAmapJsDataPrototype ? (
        <ProductGate
          loadUnlockedMemories={loadProductLocations}
          syncPhotosOnUnlock={false}
          unlockedRenderer={({ initialMemories, onLock }) => (
            <AmapJsDataPrototype memories={initialMemories} onLock={onLock} />
          )}
        />
    ) : showDeveloperVault ? (
      <VaultPrototype />
    ) : (
      <ProductGate />
    )}
  </StrictMode>,
);
