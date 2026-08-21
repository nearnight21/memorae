import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const prototypeSource = readFileSync(
  new URL('../src/prototype/AmapJsPrototype.tsx', import.meta.url),
  'utf8',
);
const dataPrototypeSource = readFileSync(
  new URL('../src/prototype/AmapJsDataPrototype.tsx', import.meta.url),
  'utf8',
);

test('高德 JS API 试验入口在生产构建可用且独立于正式 ProductGate', () => {
  assert.match(mainSource, /developerParams\.get\('amap-js-test'\) === '1'/);
  assert.match(mainSource, /showAmapJsPrototype[\s\S]*<AmapJsPrototype \/>/);
  assert.doesNotMatch(
    mainSource.slice(
      mainSource.indexOf('const showAmapJsPrototype'),
      mainSource.indexOf('const showDeveloperVault'),
    ),
    /import\.meta\.env\.DEV/,
  );
});

test('高德 JS API 试验页只加载威海纯底图', () => {
  assert.match(prototypeSource, /@amap\/amap-jsapi-loader/);
  assert.match(prototypeSource, /version: '2\.0'/);
  assert.match(prototypeSource, /const WEIHAI_CENTER: \[number, number\] = \[122\.12042, 37\.51307\]/);
  assert.match(prototypeSource, /viewMode: '2D'/);
  assert.match(prototypeSource, /mapStyle: 'amap:\/\/styles\/whitesmoke'/);
  assert.match(prototypeSource, /features: \['bg', 'road', 'point'\]/);
  assert.doesNotMatch(prototypeSource, /from ['"][^'"]*(?:memory|sync)|\b(?:Marker|Cluster|ProductGate)\b/i);
});

test('高德 JS API Key 与安全密钥只从 Vite 环境变量读取', () => {
  assert.match(prototypeSource, /VITE_MEMORY_RECALL_AMAP_JS_API_KEY/);
  assert.match(prototypeSource, /VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE/);
  assert.match(prototypeSource, /window\._AMapSecurityConfig = \{ securityJsCode \}/);
});

test('真实数据模式只通过 ProductGate 解锁后读取地点，不读取照片', () => {
  assert.match(mainSource, /developerParams\.get\('data'\) === '1'/);
  assert.match(mainSource, /loadUnlockedMemories=\{loadProductLocations\}/);
  assert.match(dataPrototypeSource, /new AMap\.Marker/);
  assert.match(dataPrototypeSource, /memory\.lat/);
  assert.doesNotMatch(dataPrototypeSource, /loadProductPhoto|decryptPhoto|photoIds/);
});
