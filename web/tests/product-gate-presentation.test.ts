import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const productGateSource = readFileSync(
  new URL('../src/product/ProductGate.tsx', import.meta.url),
  'utf8',
);

test('booting 阶段直接使用新版登录外壳而不是旧私密空间卡片', () => {
  const bootingStart = productGateSource.indexOf("if (phase === 'booting')");
  const accountStart = productGateSource.indexOf("if (phase === 'account')", bootingStart);

  assert.notEqual(bootingStart, -1);
  assert.notEqual(accountStart, -1);
  const bootingBranch = productGateSource.slice(bootingStart, accountStart);
  assert.match(bootingBranch, /<AuthShell titleId="account-login-loading-title">/);
  assert.match(bootingBranch, /className="account-login-loading"/);

  const setupFallback = productGateSource.slice(productGateSource.lastIndexOf('return ('));
  assert.doesNotMatch(setupFallback, /phase === 'booting'/);
});
