import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  InMemoryPasswordAuthStore,
  PasswordSessionAuthenticator,
} from '../src/auth.ts';
import { buildApp } from '../src/app.ts';
import type { VaultEnvelopeV1 } from '../src/contracts.ts';
import { JsonCipherStore } from '../src/store.ts';

const TEST_PASSWORD_HASH = {
  memoryKiB: 8 * 1024,
  iterations: 1,
  parallelism: 1,
};

const TOKEN_PEPPER = 'test-only-session-token-pepper-at-least-32-chars';

const vault: VaultEnvelopeV1 = {
  schema: 'memory-recall-vault',
  cryptoVersion: 1,
  createdAt: '2026-08-10T16:00:00.000Z',
  kdf: {
    name: 'Argon2id',
    salt: 'encrypted-vault-kdf-salt',
    memoryKiB: 8192,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
  },
  wrappedVmk: { algorithm: 'AES-256-GCM', iv: 'vault-iv', ciphertext: 'vault-data' },
  wrappedKeys: {
    text: { algorithm: 'AES-256-GCM', iv: 'text-iv', ciphertext: 'text-data' },
    photo: { algorithm: 'AES-256-GCM', iv: 'photo-iv', ciphertext: 'photo-data' },
  },
};

async function login(baseUrl: string, loginName: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginName, password, deviceId: `${loginName}-device` }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { accessToken: string; expiresAt: string };
  assert.match(body.accessToken, /^[A-Za-z0-9_-]+$/);
  assert.ok(Date.parse(body.expiresAt) > Date.now());
  return body.accessToken;
}

function bearer(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

test('password sessions authenticate one account without exposing another account ciphertext', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-recall-auth-'));
  const authStore = new InMemoryPasswordAuthStore();
  await authStore.addAccount({
    id: 'account-alice',
    loginName: 'alice',
    password: 'alice-test-password',
    passwordHash: TEST_PASSWORD_HASH,
  });
  await authStore.addAccount({
    id: 'account-bob',
    loginName: 'bob',
    password: 'bob-test-password',
    passwordHash: TEST_PASSWORD_HASH,
  });
  const passwordRecord = await authStore.findAccountByLogin('alice');
  assert.ok(passwordRecord);
  assert.equal(passwordRecord.passwordHash.includes('alice-test-password'), false);

  const app = await buildApp({
    store: new JsonCipherStore(join(directory, 'store.json')),
    authenticator: new PasswordSessionAuthenticator(authStore, {
      tokenPepper: TOKEN_PEPPER,
      passwordHash: TEST_PASSWORD_HASH,
    }),
  });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const missingToken = await fetch(`${baseUrl}/v1/memories`);
  assert.equal(missingToken.status, 401);

  const invalidPassword = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginName: 'alice', password: 'incorrect-password' }),
  });
  assert.equal(invalidPassword.status, 401);

  const aliceToken = await login(baseUrl, 'Alice', 'alice-test-password');
  const bobToken = await login(baseUrl, 'bob', 'bob-test-password');

  const aliceWrite = await fetch(`${baseUrl}/v1/vault`, {
    method: 'PUT',
    headers: { ...bearer(aliceToken), 'content-type': 'application/json' },
    body: JSON.stringify(vault),
  });
  assert.equal(aliceWrite.status, 204);

  const bobRead = await fetch(`${baseUrl}/v1/vault`, { headers: bearer(bobToken) });
  assert.equal(bobRead.status, 404);

  const bobMemories = await fetch(`${baseUrl}/v1/memories`, { headers: bearer(bobToken) });
  assert.deepEqual(await bobMemories.json(), { items: [] });

  const aliceRead = await fetch(`${baseUrl}/v1/vault`, { headers: bearer(aliceToken) });
  assert.equal(aliceRead.status, 200);
  assert.deepEqual(await aliceRead.json(), vault);

  const invalidToken = await fetch(`${baseUrl}/v1/memories`, {
    headers: bearer('not-a-valid-session-token'),
  });
  assert.equal(invalidToken.status, 401);

  const logout = await fetch(`${baseUrl}/v1/auth/logout`, {
    method: 'POST',
    headers: bearer(aliceToken),
  });
  assert.equal(logout.status, 204);
  const afterLogout = await fetch(`${baseUrl}/v1/memories`, {
    headers: bearer(aliceToken),
  });
  assert.equal(afterLogout.status, 401);
});

test('WeChat OAuth creates an account once and exchanges a one-time browser handoff', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-recall-wechat-'));
  const authStore = new InMemoryPasswordAuthStore();
  const app = await buildApp({
    store: new JsonCipherStore(join(directory, 'store.json')),
    allowedOrigins: ['http://localhost:3000'],
    authenticator: new PasswordSessionAuthenticator(authStore, {
      tokenPepper: TOKEN_PEPPER,
      passwordHash: TEST_PASSWORD_HASH,
    }),
    wechat: {
      appId: 'wx-test-app',
      appSecret: 'test-secret',
      callbackUrl: 'http://localhost:8788/v1/auth/wechat/callback',
      stateSecret: 'wechat-state-secret-at-least-32-characters',
      exchangeCode: async (code) => {
        assert.equal(code, 'test-code');
        return { openId: 'openid-001', unionId: 'unionid-001' };
      },
    },
  });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const start = await fetch(
    `${baseUrl}/v1/auth/wechat/start?returnTo=${encodeURIComponent('http://localhost:3000/')}`,
    { redirect: 'manual' },
  );
  assert.equal(start.status, 302);
  const stateLocation = new URL(start.headers.get('location')!);
  const state = stateLocation.searchParams.get('state');
  assert.ok(state);
  const stateCookie = start.headers.get('set-cookie')!.split(';', 1)[0];

  const callback = await fetch(
    `${baseUrl}/v1/auth/wechat/callback?code=test-code&state=${encodeURIComponent(state!)}`,
    { headers: { cookie: stateCookie }, redirect: 'manual' },
  );
  assert.equal(callback.status, 302);
  const handoffLocation = new URL(callback.headers.get('location')!);
  const handoffCode = handoffLocation.searchParams.get('wechat_code');
  assert.ok(handoffCode);
  assert.equal(handoffLocation.hash, '#app');

  const exchanged = await fetch(`${baseUrl}/v1/auth/wechat/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: handoffCode }),
  });
  assert.equal(exchanged.status, 200);
  const session = await exchanged.json() as { accessToken: string; expiresAt: string };
  assert.match(session.accessToken, /^[A-Za-z0-9_-]+$/);
  assert.ok(Date.parse(session.expiresAt) > Date.now());

  const replay = await fetch(`${baseUrl}/v1/auth/wechat/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: handoffCode }),
  });
  assert.equal(replay.status, 401);

  const account = await authStore.findAccountByLogin('wechat:unionid-001');
  assert.ok(account);
});

test('email verification creates an account and consumes a code once', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-recall-email-'));
  const authStore = new InMemoryPasswordAuthStore();
  let sentCode = '';
  const app = await buildApp({
    store: new JsonCipherStore(join(directory, 'store.json')),
    allowedOrigins: ['http://localhost:3000'],
    authenticator: new PasswordSessionAuthenticator(authStore, {
      tokenPepper: TOKEN_PEPPER,
      passwordHash: TEST_PASSWORD_HASH,
    }),
    emailStore: authStore,
    email: {
      codeSecret: 'test-only-email-code-secret-at-least-32-chars',
      sender: {
        async sendVerificationCode(_email, code) {
          sentCode = code;
        },
      },
    },
  });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const requestCode = await fetch(`${baseUrl}/v1/auth/email/request-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'New.User@example.com' }),
  });
  assert.equal(requestCode.status, 204);
  assert.match(sentCode, /^\d{6}$/);

  const duplicateRequest = await fetch(`${baseUrl}/v1/auth/email/request-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'new.user@example.com' }),
  });
  assert.equal(duplicateRequest.status, 429);

  const invalid = await fetch(`${baseUrl}/v1/auth/email/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'new.user@example.com', code: '000000' }),
  });
  assert.equal(invalid.status, 401);

  const verified = await fetch(`${baseUrl}/v1/auth/email/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'new.user@example.com', code: sentCode }),
  });
  assert.equal(verified.status, 200, await verified.clone().text());
  const session = await verified.json() as { accessToken: string; expiresAt: string };
  assert.match(session.accessToken, /^[A-Za-z0-9_-]+$/);
  assert.ok(Date.parse(session.expiresAt) > Date.now());

  const replay = await fetch(`${baseUrl}/v1/auth/email/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'new.user@example.com', code: sentCode }),
  });
  assert.equal(replay.status, 401);
  assert.ok(await authStore.findAccountByLogin('email:new.user@example.com'));
});

test('email registration and login use distinct scenes', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-recall-email-scene-'));
  const authStore = new InMemoryPasswordAuthStore();
  const sentCodes: string[] = [];
  const app = await buildApp({
    store: new JsonCipherStore(join(directory, 'store.json')),
    allowedOrigins: ['http://localhost:3000'],
    authenticator: new PasswordSessionAuthenticator(authStore, {
      tokenPepper: TOKEN_PEPPER,
      passwordHash: TEST_PASSWORD_HASH,
    }),
    emailStore: authStore,
    email: {
      codeSecret: 'test-only-email-code-secret-at-least-32-chars',
      requestIntervalMs: 0,
      sender: {
        async sendVerificationCode(_email, code) {
          sentCodes.push(code);
        },
      },
    },
  });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const post = (path: string, body: unknown) => fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const loginMissing = await post('/v1/auth/email/request-code', {
    email: 'scene.user@example.com',
    scene: 'login',
  });
  assert.equal(loginMissing.status, 404);

  const registerNew = await post('/v1/auth/email/request-code', {
    email: 'scene.user@example.com',
    scene: 'register',
  });
  assert.equal(registerNew.status, 204);
  assert.match(sentCodes[0], /^\d{6}$/);

  const verified = await post('/v1/auth/email/verify', {
    email: 'scene.user@example.com',
    code: sentCodes[0],
  });
  assert.equal(verified.status, 200);
  assert.ok(await authStore.findAccountByLogin('email:scene.user@example.com'));

  const registerExisting = await post('/v1/auth/email/request-code', {
    email: 'scene.user@example.com',
    scene: 'register',
  });
  assert.equal(registerExisting.status, 409);

  const loginExisting = await post('/v1/auth/email/request-code', {
    email: 'scene.user@example.com',
    scene: 'login',
  });
  assert.equal(loginExisting.status, 204);
  assert.match(sentCodes[1], /^\d{6}$/);
});
