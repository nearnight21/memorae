import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildMapTestMarkers, TEST_CITIES } from '../src/map/mapTestMarkers';

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

test('高德原生 View 使用 Android 布局测量动态加入的 MapView', async () => {
  const source = await readFile(
    new URL(
      '../modules/expo-amap-map/android/src/main/java/expo/modules/amapmap/ExpoAmapMapView.kt',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(source, /override val shouldUseAndroidLayout = true/);
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
