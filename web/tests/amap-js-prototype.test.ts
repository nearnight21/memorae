import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const dataPrototypeSource = readFileSync(
  new URL('../src/prototype/AmapJsDataPrototype.tsx', import.meta.url),
  'utf8',
);
const runtimeSource = readFileSync(
  new URL('../src/prototype/AmapJsRuntime.tsx', import.meta.url),
  'utf8',
);

test('纯底图入口已删除，真实数据模式仍需同时提供两个参数', () => {
  assert.match(
    mainSource,
    /developerParams\.get\('amap-js-test'\) === '1'[\s\S]*developerParams\.get\('data'\) === '1'/,
  );
  assert.doesNotMatch(mainSource, /AmapJsPrototype/);
  assert.doesNotMatch(mainSource, /showAmapJsPrototype/);
});

test('真实数据模式只通过 ProductGate 解锁后读取地点，不读取照片', () => {
  assert.match(mainSource, /developerParams\.get\('data'\) === '1'/);
  assert.match(mainSource, /loadUnlockedMemories=\{loadProductLocations\}/);
  assert.match(mainSource, /syncPhotosOnUnlock=\{false\}/);
  assert.match(dataPrototypeSource, /new AMap\.Marker/);
  assert.match(dataPrototypeSource, /memory\.lat/);
  assert.doesNotMatch(dataPrototypeSource, /loadProductPhoto|decryptPhoto|photoIds/);
});

test('RN WebView Runtime 使用低频桥接事件和高德聚类插件', () => {
  assert.match(mainSource, /developerParams\.get\('amap-runtime'\) === '1'/);
  assert.match(runtimeSource, /plugins: \['AMap\.MarkerCluster'\]/);
  assert.match(runtimeSource, /type: 'ready'/);
  assert.match(runtimeSource, /type: 'markerPressed'/);
  assert.match(runtimeSource, /type: 'mapPressed'/);
  assert.match(runtimeSource, /type: 'cameraIdle'/);
  assert.doesNotMatch(runtimeSource, /requestAnimationFrame|mousemove|touchmove/);
});
