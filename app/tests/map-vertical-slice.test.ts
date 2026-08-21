import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildMapTestMarkers, TEST_CITIES } from '../src/map/mapTestMarkers';
import {
  OVERSEAS_CITIES,
  OVERSEAS_CITY_SOURCE_COUNT,
  selectVisibleOverseasCities,
} from '../src/map/overseasCityData';

const require = createRequire(import.meta.url);
const { patchReleaseSigning } = require('../plugins/with-android-release-signing.js') as {
  patchReleaseSigning: (contents: string) => string;
};

const thumbnails = [
  { key: 'thumb-a', dataUri: 'data:image/jpeg;base64,YQ==' },
  { key: 'thumb-b', dataUri: 'data:image/jpeg;base64,Yg==' },
] as const;

test('地图垂直切片生成确定性的 20/100 个原生照片点', () => {
  for (const count of [20, 100] as const) {
    const first = buildMapTestMarkers(count, thumbnails, null);
    const second = buildMapTestMarkers(count, thumbnails, null);
    assert.equal(first.length, count);
    assert.deepEqual(first, second);
    assert.equal(new Set(first.map((marker) => marker.id)).size, count);
    assert.ok(first.every((marker) => marker.thumbnailKey?.startsWith('thumb-')));
  }
});

test('测试点覆盖北京、东京、巴黎和纽约，并且只选中指定 Marker', () => {
  const selectedId = 'map-slice-100-7';
  const markers = buildMapTestMarkers(100, thumbnails, selectedId);
  const selected = markers.filter((marker) => marker.selected);
  assert.deepEqual(selected.map((marker) => marker.id), [selectedId]);

  for (const center of Object.values(TEST_CITIES)) {
    assert.ok(markers.some((marker) => (
      Math.abs(marker.latitude - center.latitude) < 0.25
      && Math.abs(marker.longitude - center.longitude) < 0.25
    )));
  }
});

test('地图测试入口只创建 thumbnail，不读取同步照片或生成更大版本', async () => {
  const source = await readFile(
    new URL('../src/map/MapVerticalSliceApp.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /spec\.kind === 'thumbnail'/);
  assert.doesNotMatch(source, /getEncryptedPhoto|downloadPhoto|decryptPhoto/);
  assert.doesNotMatch(source, /spec\.kind === 'preview'/);
  assert.doesNotMatch(source, /spec\.kind === 'original'/);
});

test('海外城市标签只在语义上下文中显示中文名，中国大陆不注入自定义城市层', () => {
  const tokyoContext = {
    kind: 'memory' as const,
    target: TEST_CITIES.东京,
  };
  const tokyo = selectVisibleOverseasCities(10, {
    northEast: { latitude: 36.4, longitude: 140.5 },
    southWest: { latitude: 34.7, longitude: 138.5 },
  }, tokyoContext);
  assert.ok(tokyo.some((city) => city.name === '东京'));
  assert.ok(tokyo.some((city) => city.name === '横滨'));
  assert.ok(tokyo.every((city) => city.name !== city.sourceName));
  assert.ok(tokyo.every((city) => city.countryCode !== 'CN'));

  const beijing = selectVisibleOverseasCities(10, {
    northEast: { latitude: 40.8, longitude: 116.9 },
    southWest: { latitude: 39.1, longitude: 115.9 },
  }, { kind: 'location-picker', target: TEST_CITIES.北京 });
  assert.deepEqual(beijing, []);
});

test('普通浏览及世界或国家层级不显示海外城市标签', () => {
  const worldBounds = {
    northEast: { latitude: 85, longitude: 179 },
    southWest: { latitude: -85, longitude: -179 },
  };
  assert.deepEqual(selectVisibleOverseasCities(10, worldBounds, null), []);
  const world = selectVisibleOverseasCities(3.5, {
    northEast: { latitude: 85, longitude: 179 },
    southWest: { latitude: -85, longitude: -179 },
  }, { kind: 'memory', target: TEST_CITIES.巴黎 });
  assert.deepEqual(world, []);
});

test('地点选取比记忆浏览逐级展示更多当前目标周边城市', () => {
  const bounds = {
    northEast: { latitude: 50.2, longitude: 7.8 },
    southWest: { latitude: 42.8, longitude: -1.8 },
  };
  const memory = selectVisibleOverseasCities(
    10,
    bounds,
    { kind: 'memory', target: TEST_CITIES.巴黎 },
  );
  const picker = selectVisibleOverseasCities(
    10,
    bounds,
    { kind: 'location-picker', target: TEST_CITIES.巴黎 },
  );
  assert.ok(memory.some((city) => city.name === '巴黎'));
  assert.ok(picker.length >= memory.length);
  assert.ok(picker.some((city) => city.name === '兰斯'));
  assert.ok(picker.length <= 72);
});

test('海外标签保留完整 GeoNames 源，并为首轮验收城市提供受控中文名', () => {
  assert.equal(OVERSEAS_CITY_SOURCE_COUNT, 5_642);
  const sourceNames = new Set(OVERSEAS_CITIES.map((city) => city.sourceName));
  for (const sourceName of [
    'Tokyo', 'Yokohama', 'Osaka', 'Kyoto', 'Paris', 'Lyon',
    'New York City', 'Boston', 'London', 'Manchester',
  ]) {
    assert.ok(sourceNames.has(sourceName), `缺少海外验收城市：${sourceName}`);
  }
});

test('高德原生 View 使用 Android 布局测量动态加入的 MapView', async () => {
  const source = await readFile(
    new URL(
      '../modules/expo-amap-map/android/src/main/java/expo/modules/amapmap/ExpoAmapMapView.kt',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(source, /override val shouldUseAndroidLayout = true/);
  assert.match(source, /fun setCityLabels\(/);
  assert.match(source, /RenderedMarkerTag\.CityLabel/);
  assert.match(source, /marker\.setClickable\(false\)/);
  const cityBitmapSource = source.match(
    /private fun createCityLabelBitmap[\s\S]*?private fun cityLabelWidth/,
  )?.[0] ?? '';
  assert.doesNotMatch(cityBitmapSource, /drawRoundRect|Paint\.Style\.STROKE/);
});

test('Release 签名插件只替换 release build type，不污染 debug build type', () => {
  const fixture = `def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`;
  const patched = patchReleaseSigning(fixture);
  assert.match(patched, /debug\s*\{\s*signingConfig signingConfigs\.debug/);
  assert.match(
    patched,
    /release\s*\{\s*signingConfig memoryRecallReleaseSigningConfigured \? signingConfigs\.release : signingConfigs\.debug/,
  );
  assert.equal(patchReleaseSigning(patched), patched);
});

test('Release 默认拒绝明文网络，Debug Development Build 允许本地开发服务器', async () => {
  const source = await readFile(
    new URL('../plugins/with-local-network-security.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /<base-config cleartextTrafficPermitted="false" \/>/);
  assert.match(source, /<base-config cleartextTrafficPermitted="true" \/>/);
  assert.match(source, /'app',\s*'src',\s*'debug',\s*'res',\s*'xml'/);
});
