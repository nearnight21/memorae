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

test('登录与注册为独立视图，注册需设置密码，登录页不出现验证码', () => {
  assert.match(productGateSource, /useState<'login' \| 'register'>\('login'\)/);
  assert.match(productGateSource, /authMode === 'register' && MEMORY_RECALL_API_URL && EMAIL_LOGIN_ENABLED/);
  assert.match(productGateSource, /requestEmailVerificationCode\(MEMORY_RECALL_API_URL, email\.trim\(\), 'register'\)/);
  assert.match(productGateSource, /verifyEmailCode\(MEMORY_RECALL_API_URL, email\.trim\(\), emailCode\.trim\(\), registerPassword\)/);
  assert.match(productGateSource, /account-register-password/);
  assert.match(productGateSource, /还没有账号？/);
  assert.match(productGateSource, /已有账号？/);
  assert.doesNotMatch(productGateSource, /邮箱验证码登录/);
  assert.doesNotMatch(productGateSource, /完成注册 \/ 登录/);
});
