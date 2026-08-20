import assert from 'node:assert/strict';
import test from 'node:test';
import { createVault, destroyVaultSession, VaultUnlockError } from '../src/crypto';
import {
  PRIVATE_SPACE_NETWORK_ERROR,
  PRIVATE_SPACE_PASSWORD_ERROR,
  PRIVATE_SPACE_VAULT_MISMATCH_ERROR,
  privateSpaceUnlockErrorMessage,
  unlockPrivateSpaceLocally,
} from '../src/product/privateSpaceUnlock';
import { VaultMismatchError } from '../src/sync/syncActions';

const PASSWORD = 'private-space-password-for-local-test';

test('私密空间密码只在本机打开密钥信封，不触发网络请求', async () => {
  const created = await createVault(PASSWORD, {
    memoryKiB: 8 * 1024,
    iterations: 2,
    parallelism: 1,
  });
  destroyVaultSession(created.session);

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('本机解锁不应访问网络');
  }) as typeof fetch;

  try {
    const session = await unlockPrivateSpaceLocally(created.envelope, PASSWORD);
    assert.equal(fetchCalls, 0);
    assert.equal(session.destroyed, false);
    assert.equal(session.vmk.byteLength, 32);
    destroyVaultSession(session);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('私密空间解锁异常只显示确认过的用户文案', () => {
  assert.equal(
    privateSpaceUnlockErrorMessage(new VaultUnlockError()),
    PRIVATE_SPACE_PASSWORD_ERROR,
  );
  assert.equal(
    privateSpaceUnlockErrorMessage(new VaultMismatchError()),
    PRIVATE_SPACE_VAULT_MISMATCH_ERROR,
  );
  assert.equal(
    privateSpaceUnlockErrorMessage(new TypeError('Failed to fetch')),
    PRIVATE_SPACE_NETWORK_ERROR,
  );
});
