import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  diffNativeMarkers,
  fromNativeCameraIdle,
  fromNativeClusterPress,
  fromNativeMarkerPress,
  isNativeThumbnailUri,
  nativeCameraStatesEqual,
  selectMarkersForUpdate,
  toNativeMapMarker,
  type NativeMapMarker,
} from '../src/map/nativeMapAdapterModel';
import {
  nativeAmapPrivacyConsentEnabled,
  selectMemoraeMapRenderer,
} from '../src/map/mapRendererSelection';
import type { MemoryMapMarker } from '../src/map/MemoraeMap.types';

const marker: MemoryMapMarker = {
  id: 'memory-1',
  latitude: 31.2354,
  longitude: 121.47475,
  thumbnail: { uri: 'memorae-thumbnail:///opaque', cacheKey: 'thumb-1' },
  region: { country: '中国', province: '上海市', city: '上海市' },
};

test('Renderer flag 只在 Android 显式选择 Native，其他情况保留 WebView', () => {
  assert.equal(selectMemoraeMapRenderer('android', 'native-amap'), 'native-amap');
  assert.equal(selectMemoraeMapRenderer('android', undefined), 'webview');
  assert.equal(selectMemoraeMapRenderer('ios', 'native-amap'), 'webview');
  assert.equal(nativeAmapPrivacyConsentEnabled('1'), true);
  assert.equal(nativeAmapPrivacyConsentEnabled('true'), false);
});

test('中立 Marker 转换为最小 Native DTO 且拒绝 Data URI', () => {
  const native = toNativeMapMarker(marker, () => 'file:///cache/thumb.jpg');
  assert.deepEqual(native, {
    id: 'memory-1',
    latitude: 31.2354,
    longitude: 121.47475,
    thumbnailKey: 'thumb-1',
    thumbnailUri: 'file:///cache/thumb.jpg',
    country: '中国',
    province: '上海市',
    city: '上海市',
  });
  assert.equal(toNativeMapMarker(marker, () => 'data:image/jpeg;base64,YQ==').thumbnailUri, undefined);
  assert.equal(isNativeThumbnailUri('https://example.com/photo.jpg'), false);
});

test('Native 事件转换回 Phase 1 中立契约', () => {
  assert.deepEqual(fromNativeMarkerPress('memory-1'), { markerId: 'memory-1' });
  assert.deepEqual(fromNativeClusterPress({
    ids: ['memory-1', 'memory-2'],
    count: 2,
    latitude: 31.2,
    longitude: 121.4,
    label: '上海',
  }), {
    markerIds: ['memory-1', 'memory-2'],
    count: 2,
    coordinate: { latitude: 31.2, longitude: 121.4 },
    label: '上海',
  });
  assert.deepEqual(fromNativeCameraIdle({
    camera: { latitude: 31.2, longitude: 121.4, zoom: 9 },
    bounds: {
      northEast: { latitude: 32, longitude: 122 },
      southWest: { latitude: 30, longitude: 120 },
    },
  }), {
    camera: { latitude: 31.2, longitude: 121.4, zoom: 9 },
    bounds: {
      northEast: { latitude: 32, longitude: 122 },
      southWest: { latitude: 30, longitude: 120 },
    },
  });
});

test('Native Camera epsilon 阻止 idle 回写触发重复 CameraUpdate', () => {
  const actual = { latitude: 31.2, longitude: 121.4, zoom: 9 };
  assert.equal(nativeCameraStatesEqual(actual, { latitude: 31.2000001, longitude: 121.4000001, zoom: 9.0001 }), true);
  assert.equal(nativeCameraStatesEqual(actual, { latitude: 31.21, longitude: 121.4, zoom: 9 }), false);
});

test('Marker diff 按 ID 区分增删、坐标、缩略图和选中状态', () => {
  const current: NativeMapMarker[] = [
    { id: 'same', latitude: 1, longitude: 1 },
    { id: 'remove', latitude: 2, longitude: 2 },
    { id: 'move', latitude: 3, longitude: 3 },
    { id: 'thumb', latitude: 4, longitude: 4, thumbnailKey: 'a' },
    { id: 'select', latitude: 5, longitude: 5, selected: false },
  ];
  const next: NativeMapMarker[] = [
    { id: 'same', latitude: 1, longitude: 1 },
    { id: 'add', latitude: 6, longitude: 6 },
    { id: 'move', latitude: 3.1, longitude: 3 },
    { id: 'thumb', latitude: 4, longitude: 4, thumbnailKey: 'b' },
    { id: 'select', latitude: 5, longitude: 5, selected: true },
  ];
  const diff = diffNativeMarkers(current, next);
  assert.deepEqual(diff.added, ['add']);
  assert.deepEqual(diff.removed, ['remove']);
  assert.deepEqual(diff.coordinateUpdated, ['move']);
  assert.deepEqual(diff.thumbnailUpdated, ['thumb']);
  assert.deepEqual(diff.selectedUpdated, ['select']);
  assert.deepEqual(diff.unchanged, ['same']);
});

test('暂停 Marker 更新时只保留最新 props，恢复后一次应用', () => {
  const current = [{ id: 'old' }];
  const latest = [{ id: 'latest' }];
  assert.deepEqual(selectMarkersForUpdate(current, latest, true), {
    applied: current,
    pending: latest,
  });
  assert.deepEqual(selectMarkersForUpdate(current, latest, false), {
    applied: latest,
    pending: null,
  });
});

test('Native DTO 边界不包含完整 Memory 或凭据字段', async () => {
  const [adapter, types, kotlin] = await Promise.all([
    readFile(new URL('../src/map/AndroidNativeMemoraeMapAdapter.android.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../modules/expo-amap-map/src/ExpoAmapMap.types.ts', import.meta.url), 'utf8'),
    readFile(new URL('../modules/expo-amap-map/android/src/main/java/expo/modules/amapmap/ExpoAmapMapView.kt', import.meta.url), 'utf8'),
  ]);
  const boundary = `${adapter}\n${types}`;
  for (const forbidden of ['MemoryV2', 'ciphertext', 'authToken', 'vmk', 'thumbnailDataUri']) {
    assert.doesNotMatch(boundary, new RegExp(forbidden, 'i'));
  }
  assert.doesNotMatch(kotlin, /Base64|thumbnailDataUri/);
  assert.match(kotlin, /context\.cacheDir\.canonicalFile/);
});

test('TextureMapView 生命周期只有 Activity 与 View destroy 两个权威', async () => {
  const source = await readFile(
    new URL('../modules/expo-amap-map/android/src/main/java/expo/modules/amapmap/ExpoAmapMapView.kt', import.meta.url),
    'utf8',
  );
  assert.match(source, /TextureMapView\(context\)/);
  assert.match(source, /nativeMapView\.onCreate\(restoredMapBundle\)/);
  assert.doesNotMatch(source, /onCreate\(null\)/);
  const attach = source.match(/override fun onAttachedToWindow[\s\S]*?override fun onDetachedFromWindow/)?.[0] ?? '';
  const detach = source.match(/override fun onDetachedFromWindow[\s\S]*?override fun onSizeChanged/)?.[0] ?? '';
  assert.doesNotMatch(attach, /onResume\(/);
  assert.doesNotMatch(detach, /onPause\(|onDestroy\(|destroyMap/);
  assert.match(source, /SavedStateRegistryOwner/);
  assert.match(source, /registerSavedStateProvider/);
  assert.match(source, /mapView\?\.onSaveInstanceState\(mapState\)/);
});

test('Privacy 顺序在 TextureMapView 创建之前且不同意时不初始化', async () => {
  const source = await readFile(
    new URL('../modules/expo-amap-map/android/src/main/java/expo/modules/amapmap/ExpoAmapMapView.kt', import.meta.url),
    'utf8',
  );
  const initialize = source.match(/private fun initializeMapIfNeeded[\s\S]*?private fun configureMap\(/)?.[0] ?? '';
  assert.match(initialize, /!privacyConsentGranted/);
  assert.ok(initialize.indexOf('updatePrivacyShow') < initialize.indexOf('TextureMapView(context)'));
  assert.ok(initialize.indexOf('updatePrivacyAgree') < initialize.indexOf('TextureMapView(context)'));
  assert.ok(initialize.indexOf('loadWorldVectorMap') < initialize.indexOf('TextureMapView(context)'));
});

test('Phase 1 公共接口没有因 Android Native 扩张', async () => {
  const source = await readFile(new URL('../src/map/MemoraeMap.types.ts', import.meta.url), 'utf8');
  for (const forbidden of ['AMap', 'LatLng', 'Marker SDK', 'Bundle', 'Projection', 'privacyConsentGranted']) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
  assert.match(source, /markers: readonly MemoryMapMarker\[\]/);
  assert.match(source, /updatesPaused\?: boolean/);
});
