import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWebRootRoute } from '../src/landing/landingRouting';

test('默认根路径无参数时返回 landing 落地页', () => {
  assert.equal(resolveWebRootRoute({ hash: '', search: '', isDev: false }), 'landing');
  assert.equal(resolveWebRootRoute({ hash: '#', search: '', isDev: false }), 'landing');
  assert.equal(resolveWebRootRoute({ hash: '', search: '?foo=bar', isDev: false }), 'landing');
});

test('hash 包含 #app 或其子路径时直达 app', () => {
  assert.equal(resolveWebRootRoute({ hash: '#app', search: '', isDev: false }), 'app');
  assert.equal(resolveWebRootRoute({ hash: '#app/', search: '', isDev: false }), 'app');
  assert.equal(resolveWebRootRoute({ hash: '#app?mode=view', search: '', isDev: false }), 'app');
});

test('query 参数显式指定 app=1 或 app=true 时直达 app', () => {
  assert.equal(resolveWebRootRoute({ hash: '', search: '?app=1', isDev: false }), 'app');
  assert.equal(resolveWebRootRoute({ hash: '', search: '?app=true', isDev: false }), 'app');
  assert.equal(resolveWebRootRoute({ hash: '', search: '?other=1&app=1', isDev: false }), 'app');
});

test('既有原型与试验参数依然保持直达', () => {
  assert.equal(
    resolveWebRootRoute({ hash: '', search: '?amap-runtime=1', isDev: false }),
    'amap-runtime',
  );
  assert.equal(
    resolveWebRootRoute({ hash: '', search: '?amap-js-test=1&data=1', isDev: false }),
    'amap-data-prototype',
  );
});

test('开发专属原型参数仅在 isDev 为 true 时生效', () => {
  assert.equal(
    resolveWebRootRoute({ hash: '', search: '?crystal-timeline=1', isDev: true }),
    'crystal-timeline',
  );
  assert.equal(
    resolveWebRootRoute({ hash: '', search: '?crystal-timeline=1', isDev: false }),
    'landing',
  );
  assert.equal(
    resolveWebRootRoute({ hash: '', search: '?dev-vault=1', isDev: true }),
    'dev-vault',
  );
  assert.equal(
    resolveWebRootRoute({ hash: '', search: '?dev-vault=1', isDev: false }),
    'landing',
  );
});
