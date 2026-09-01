import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { MemoryV2 } from '../src/memory/memoryV2';
import { findMemoryForMarker, memoriesToMapMarkers } from '../src/map/memoryMapAdapter';
import {
  registerMapThumbnail,
  resetMapThumbnailCache,
  resolveMapThumbnail,
} from '../src/map/mapThumbnailCache';
import {
  cameraStatesEqual,
  fromWebViewCamera,
  toClusterPressEvent,
  toMarkerPressEvent,
  toWebViewCamera,
  toWebViewMarker,
} from '../src/map/webViewMapAdapterModel';

function memory(id: string, location: MemoryV2['location']): MemoryV2 {
  return {
    schemaVersion: 2,
    id,
    title: `私密标题 ${id}`,
    pastSelf: '私密正文',
    presentSelf: '私密现状',
    date: '2026-09-01',
    category: 'travel',
    tag: '私密标签',
    pinnedBy: 'pin',
    board: { px: 50, py: 50, rotation: 0 },
    location,
    photos: [{ id: `photo-${id}`, mimeType: 'image/jpeg' }],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

test('业务地图边界不再导入 WebView 或高德专有类型', async () => {
  const businessFiles = [
    '../App.tsx',
    '../src/home/HomeScreen.tsx',
    '../src/location/LocationPicker.tsx',
    '../src/map/homeMapModel.ts',
    '../src/map/memoryMapAdapter.ts',
    '../src/map/MemoraeMap.types.ts',
  ];
  for (const relativePath of businessFiles) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /AmapJsWebViewMap|AmapWebViewMarker|AmapMapCamera|AmapMapBounds/);
    assert.doesNotMatch(source, /com\.amap|LatLng|android\.os\.Bundle/);
  }

  const facade = await readFile(new URL('../src/map/MemoraeMap.tsx', import.meta.url), 'utf8');
  assert.match(facade, /WebViewMemoraeMapAdapter/);
});

test('MemoryV2 只投影地图真正需要的中立 Marker 数据', () => {
  const located = memory('memory-a', {
    name: '杭州',
    mx: 50,
    my: 50,
    lat: 30.2741,
    lng: 120.1551,
    country: '中国',
    province: '浙江省',
    city: '杭州市',
    provider: 'amap',
  });
  const missingCoordinates = memory('memory-b', { name: '旧地点', mx: 50, my: 50 });
  const thumbnail = {
    uri: 'memorae-thumbnail:///thumbnail%3Aphoto-memory-a',
    cacheKey: 'thumbnail:photo-memory-a',
  };
  const markers = memoriesToMapMarkers([located, missingCoordinates], {
    'memory-a': [thumbnail],
  });

  assert.deepEqual(markers, [{
    id: 'memory-a',
    latitude: 30.2741,
    longitude: 120.1551,
    thumbnail,
    region: { country: '中国', province: '浙江省', city: '杭州市' },
  }]);
  const serialized = JSON.stringify(markers);
  for (const forbidden of [
    '私密标题', '私密正文', '私密现状', '私密标签',
    'ciphertext', 'VMK', 'token', 'data:image', 'thumbnailRef',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `地图 DTO 泄漏字段：${forbidden}`);
  }
});

test('地图缩略图公开为 opaque URI，明文字节只留在可清理的内存兼容缓存', () => {
  resetMapThumbnailCache();
  const thumbnail = registerMapThumbnail('thumbnail:photo-a', new Uint8Array([1, 2, 3]));
  assert.equal(thumbnail.uri, 'memorae-thumbnail:///thumbnail%3Aphoto-a');
  assert.equal(thumbnail.uri.startsWith('data:'), false);
  assert.equal(resolveMapThumbnail(thumbnail), 'data:image/jpeg;base64,AQID');
  resetMapThumbnailCache();
  assert.equal(resolveMapThumbnail(thumbnail), undefined);
});

test('memoryMapAdapter 拒绝把 Data URI 带入中立 Marker DTO', () => {
  const located = memory('memory-a', { name: 'A', mx: 50, my: 50, lat: 30, lng: 120 });
  const [marker] = memoriesToMapMarkers([located], {
    'memory-a': [{ uri: 'data:image/jpeg;base64,AQID', cacheKey: 'forbidden' }],
  });
  assert.equal(marker.thumbnail, undefined);
});

test('Marker press 只回传 markerId 并可反查正确 Memory', () => {
  const first = memory('memory-a', { name: 'A', mx: 50, my: 50, lat: 30, lng: 120 });
  const second = memory('memory-b', { name: 'B', mx: 50, my: 50, lat: 31, lng: 121 });
  const event = toMarkerPressEvent('memory-b');
  assert.deepEqual(event, { markerId: 'memory-b' });
  assert.equal(findMemoryForMarker([first, second], event.markerId), second);
});

test('WebView Adapter 完成 Marker 和聚类事件兼容映射', () => {
  const marker = toWebViewMarker({
    id: 'memory-a',
    latitude: 30.2741,
    longitude: 120.1551,
    region: { country: '中国', province: '浙江省', city: '杭州市' },
  });
  assert.deepEqual(marker, {
    id: 'memory-a',
    lat: 30.2741,
    lng: 120.1551,
    country: '中国',
    province: '浙江省',
    city: '杭州市',
  });

  assert.deepEqual(toClusterPressEvent({
    ids: ['memory-a', 'memory-b'],
    count: 2,
    lat: 30.2,
    lng: 120.1,
    scope: 'city',
    label: '杭州',
  }), {
    markerIds: ['memory-a', 'memory-b'],
    count: 2,
    coordinate: { latitude: 30.2, longitude: 120.1 },
    label: '杭州',
  });
});

test('WebView Camera DTO 与中立 Camera/Bounds 双向转换', () => {
  const camera = { latitude: 30.2741, longitude: 120.1551, zoom: 9 };
  assert.deepEqual(toWebViewCamera(camera), { lat: 30.2741, lng: 120.1551, zoom: 9 });
  assert.deepEqual(fromWebViewCamera({
    lat: 30.2741,
    lng: 120.1551,
    zoom: 9,
    bounds: { north: 31, south: 29, east: 121, west: 119 },
  }), {
    camera,
    bounds: {
      northEast: { latitude: 31, longitude: 121 },
      southWest: { latitude: 29, longitude: 119 },
    },
  });
  assert.deepEqual(fromWebViewCamera({ lat: 30, lng: 120 }, camera).camera, {
    latitude: 30,
    longitude: 120,
    zoom: 9,
  });
});

test('Camera epsilon 阻止 idle 回写形成重复移动命令', () => {
  const idle = { latitude: 30.2741, longitude: 120.1551, zoom: 9 };
  assert.equal(cameraStatesEqual(idle, {
    latitude: idle.latitude + 0.0000005,
    longitude: idle.longitude - 0.0000005,
    zoom: idle.zoom + 0.0005,
  }), true);
  assert.equal(cameraStatesEqual(idle, { ...idle, longitude: idle.longitude + 0.00001 }), false);
  assert.equal(cameraStatesEqual(idle, { ...idle, zoom: idle.zoom + 0.01 }), false);
});

test('LocationPicker 继续由 Camera idle 中心点驱动且不引入屏幕投影', async () => {
  const source = await readFile(new URL('../src/location/LocationPicker.tsx', import.meta.url), 'utf8');
  assert.match(source, /cameraIdle\?\.latitude/);
  assert.match(source, /onCameraIdle=\{\(event\) => resolveCenter\(event\.camera\)\}/);
  assert.match(source, /locationClient\.reverse\(\{ lat: next\.latitude, lng: next\.longitude \}\)/);
  assert.doesNotMatch(source, /latLngToScreen|screenToLatLng|AmapJsWebViewMap/);
});
