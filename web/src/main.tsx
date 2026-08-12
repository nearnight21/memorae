import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import VaultPrototype from './prototype/VaultPrototype.tsx';
import ProductGate from './product/ProductGate.tsx';
import './index.css';

const showDeveloperVault = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('dev-vault') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showDeveloperVault ? (
      <VaultPrototype />
    ) : (
      <ProductGate />
    )}
  </StrictMode>,
);
