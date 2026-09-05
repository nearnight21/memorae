import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildMapTestMarkers, TEST_CITIES } from '../src/map/mapTestMarkers';
import { AMAP_JS_MAP_STYLE, buildAmapRuntimeHtml } from '../src/map/amapRuntimeHtml';
import { findMemoryForMarker, memoriesToMapMarkers } from '../src/map/memoryMapAdapter';
import {
  buildHomeRegionOptions,
  currentHomeRegionLabel,
  HOME_CHINA_CAMERA,
} from '../src/map/homeMapModel';
import { normalizeLocationResult } from '../src/location/locationClient';
import type { MemoryV2 } from '../src/memory/memoryV2';
import {
  circularPhotoIndex,
  shouldDismissDetail,
  shouldStartDetailDismiss,
  shouldStartPhotoPaging,
} from '../src/detail/detailGestures';
import {
  CITY_LABEL_MIN_ZOOM,
  OVERSEAS_CITIES,
  OVERSEAS_CITY_SOURCE_COUNT,
  selectVisibleOverseasCities,
} from '../src/map/overseasCityData';

const require = createRequire(import.meta.url);
const { patchReleaseSigning } = require('../plugins/with-android-release-signing.js') as {
  patchReleaseSigning: (contents: string) => string;
};

const thumbnails = [
  { key: 'thumb-a', uri: 'file:///cache/thumb-a.jpg' },
  { key: 'thumb-b', uri: 'file:///cache/thumb-b.jpg' },
] as const;

test('地图垂直切片生成确定性的 0/20/100 个原生照片点', () => {
  for (const count of [0, 20, 100] as const) {
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
  assert.match(source, /kind: 'location-picker'/);
  assert.match(source, /function openClusterContext/);
});

test('WebView 地图切片只通过消息发送地图数据，并接收低频事件', async () => {
  const source = await readFile(
    new URL('../src/map/AmapJsWebViewMap.tsx', import.meta.url),
    'utf8',
  );
  const runtimeSource = await readFile(
    new URL('../src/map/amapRuntimeHtml.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /buildAmapRuntimeHtml/);
  assert.match(source, /AMAP_RUNTIME_LOCAL_ORIGIN/);
  assert.match(source, /type: 'setMarkers'/);
  assert.match(source, /type: 'markerPressed'/);
  assert.match(source, /type: 'mapPressed'/);
  assert.match(source, /onMapPressed/);
  assert.match(source, /type: 'cameraIdle'/);
  assert.match(source, /onCameraIdle/);
  assert.match(source, /type: 'setCamera'/);
  assert.match(source, /markerUpdatesPaused/);
  assert.match(source, /initialCameraApplied/);
  assert.match(source, /if \(!initialCamera \|\| initialCameraApplied\.current\) return/);
  assert.match(source, /function parseRuntimeEvent/);
  assert.match(source, /process\.env\.EXPO_PUBLIC_AMAP_WEBVIEW_DEBUG === '1'/);
  assert.match(source, /webviewDebuggingEnabled=\{WEBVIEW_DEBUGGING_ENABLED\}/);
  assert.match(runtimeSource, /window\.addEventListener\('message', handleMessage\)/);
  assert.match(runtimeSource, /document\.addEventListener\('message', handleMessage\)/);
  assert.doesNotMatch(runtimeSource, /#map \{ width: calc\(100% \+ 400px\); \}/);
  assert.match(runtimeSource, /const CAMERA_FOCUS_OFFSET_X = 200/);
  assert.match(runtimeSource, /const logicalCameraCenter = \(\) =>/);
  assert.match(runtimeSource, /map\.containerToLngLat\(new AMap\.Pixel\(width \/ 2 \+ CAMERA_FOCUS_OFFSET_X, height \/ 2\)\)/);
  assert.match(runtimeSource, /const setLogicalCamera = \(zoom, lng, lat/);
  assert.match(runtimeSource, /map\.panBy\(-CAMERA_FOCUS_OFFSET_X, 0, 0\)/);
  assert.match(runtimeSource, /postCameraIdle/);
  assert.match(runtimeSource, /message\.type === 'setCamera'/);
  assert.match(runtimeSource, /Math\.abs\(currentLat - message\.lat\)/);
  assert.match(runtimeSource, /\.marker \{ display: block;/);
  assert.match(runtimeSource, /width: 58\.5px; height: 58\.5px/);
  assert.match(runtimeSource, /width: 49\.3px; height: 49\.3px/);
  assert.match(runtimeSource, /border-radius: 50%/);
  assert.match(runtimeSource, /animation: map-bubble-enter 360ms cubic-bezier\(0\.2, 0\.9, 0\.25, 1\.08\) both/);
  assert.match(runtimeSource, /@keyframes map-bubble-enter/);
  assert.match(runtimeSource, /memory-count/);
  assert.match(runtimeSource, /const label = clean\(group\.label\)/);
  assert.match(runtimeSource, /let renderedGroupSignatures = new Map\(\)/);
  assert.match(runtimeSource, /const groupSignature = \(group\) =>/);
  assert.match(runtimeSource, /let renderedScreenSignature = null/);
  assert.match(runtimeSource, /const screenSignature = JSON\.stringify\(/);
  assert.match(runtimeSource, /const screenChanged = renderedScreenSignature !== null && renderedScreenSignature !== screenSignature/);
  assert.match(runtimeSource, /screenChanged \|\| previousGroupSignatures\.get\(group\.key\) !== signature/);
  assert.match(runtimeSource, /const previousGroupSignatures = renderedGroupSignatures/);
  assert.match(runtimeSource, /const signedGroups = groups\.map\(\(group\) => \(\{ group, signature: groupSignature\(group\) \}\)\)/);
  assert.match(runtimeSource, /const shouldEnter = screenChanged \|\| previousGroupSignatures\.get\(group\.key\) !== signature/);
  assert.match(runtimeSource, /nextGroupSignatures\.set\(group\.key, signature\)/);
  assert.match(runtimeSource, /renderedGroupSignatures = nextGroupSignatures/);
  assert.match(runtimeSource, /renderedScreenSignature = screenSignature/);
  assert.match(runtimeSource, /const updateSelectedMarkers = \(\) =>/);
  assert.match(runtimeSource, /element\.classList\.toggle\('selected', ids\.includes\(selectedId\)\)/);
  assert.match(runtimeSource, /if \(renderedScreenSignature === screenSignature\) \{\s*updateSelectedMarkers\(\);\s*return;\s*\}/);
  assert.match(runtimeSource, /message\.type === 'setSelected'[\s\S]*selectedId = message\.id;\s*updateSelectedMarkers\(\);/);
  assert.doesNotMatch(runtimeSource, /message\.type === 'setSelected'[\s\S]{0,180}selectedId = message\.id;\s*render\(\);/);
  assert.match(runtimeSource, /image\.addEventListener\('load', enter, \{ once: true \}\)/);
  assert.match(runtimeSource, /image\.addEventListener\('error',[\s\S]*image\.replaceWith\(fallbackPhoto\(\)\);[\s\S]*enter\(\)/);
  assert.match(runtimeSource, /photoShell\.appendChild\(fallbackPhoto\(\)\);\s*enter\(\)/);
  assert.match(runtimeSource, /const element = markerContent\(group, ids, shouldEnter\)/);
  assert.match(runtimeSource, /content: element/);
  assert.doesNotMatch(runtimeSource, /const markerHtml =/);
  assert.match(runtimeSource, /groupDescriptor/);
  assert.match(runtimeSource, /centeredGroup/);
  assert.match(runtimeSource, /distanceFromCenter/);
  assert.match(runtimeSource, /centerLat \?\? group\.lat/);
  assert.match(runtimeSource, /centerLng \?\? group\.lng/);
  assert.match(runtimeSource, /provinceHasSingleCity/);
  assert.match(runtimeSource, /provinceHasSingleCity \? 9 : 6/);
  assert.match(runtimeSource, /PROVINCE_COLLISION_DISTANCE = 60/);
  assert.match(runtimeSource, /center: \[104\.1954, 35\.8617\], zoom: 3\.5/);
  assert.match(runtimeSource, /zooms: \[3\.5, 14\]/);
  assert.match(runtimeSource, /Math\.max\(3\.5, Math\.min\(14, message\.zoom\)\)/);
  assert.doesNotMatch(runtimeSource, /zooms: \[4, 14\]/);
  assert.doesNotMatch(runtimeSource, /Math\.max\(4, Math\.min\(14, message\.zoom\)\)/);
  assert.doesNotMatch(runtimeSource, /setFitView|MarkerCluster|transform:scale/);
  assert.doesNotMatch(source, /onScroll|onTouchMove|onPanResponderMove/);
  assert.match(source, /clearSensitiveData/);
});

test('地图 Runtime 内嵌脚本保持可执行语法', () => {
  const html = buildAmapRuntimeHtml('test-key', 'test-security-code');
  const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Function(script));
  assert.match(html, /高德脚本未初始化 AMap；请检查 JS API Key 状态与权限。/);
});

test('地点服务结果转换为 MemoryV2.location 时保留版面坐标，不把经纬度写入 mx/my', () => {
  const normalized = normalizeLocationResult({
    lat: 30.246,
    lng: 120.15,
    shortName: '西湖边',
    displayName: '西湖边 · 苏堤南口',
    provider: 'amap',
    province: '浙江省',
    city: '杭州市',
    district: '西湖区',
  }, { mx: 23, my: 71 });
  assert.equal(normalized.name, '西湖边');
  assert.equal(normalized.mx, 23);
  assert.equal(normalized.my, 71);
  assert.equal(normalized.lat, 30.246);
  assert.equal(normalized.lng, 120.15);
  assert.equal(normalized.city, '杭州市');
});

test('正式详情和地点选择器保留本轮冻结的运行状态边界', async () => {
  const detailSource = await readFile(
    new URL('../src/detail/MemoryDetailOverlay.tsx', import.meta.url),
    'utf8',
  );
  const pickerSource = await readFile(
    new URL('../src/location/LocationPicker.tsx', import.meta.url),
    'utf8',
  );
  assert.match(detailSource, /pastSelf/);
  assert.match(detailSource, /presentSelf/);
  assert.match(detailSource, /photoCount > 0/);
  assert.match(detailSource, /photoCount > 1/);
  assert.match(detailSource, /loading/);
  assert.match(detailSource, /unavailable/);
  assert.match(detailSource, /circularPhotoIndex/);
  assert.match(detailSource, /detailResponder\.panHandlers/);
  assert.match(detailSource, /shouldDismissDetail/);
  assert.doesNotMatch(detailSource, /accessibilityLabel="关闭详情"/);
  assert.doesNotMatch(detailSource, /styles\.closeIcon/);
  assert.doesNotMatch(detailSource, /updatedAt/);
  assert.match(pickerSource, /requestId\.current/);
  assert.match(pickerSource, /locationClient\.reverse/);
  assert.match(pickerSource, /locationClient\.suggest/);
  assert.match(pickerSource, /initialCamera/);
  assert.match(pickerSource, /onConfirm/);
});

test('详情照片支持首尾循环，并按主方向区分翻页与下滑关闭', () => {
  assert.equal(circularPhotoIndex(2, 1, 3), 0);
  assert.equal(circularPhotoIndex(0, -1, 3), 2);
  assert.equal(circularPhotoIndex(0, 1, 1), 0);
  assert.equal(circularPhotoIndex(0, 1, 0), 0);

  assert.equal(shouldStartPhotoPaging(24, 4), true);
  assert.equal(shouldStartPhotoPaging(12, 12), false);
  assert.equal(shouldStartDetailDismiss(4, 24), true);
  assert.equal(shouldStartDetailDismiss(20, 20), false);
  assert.equal(shouldStartDetailDismiss(0, -24), false);

  assert.equal(shouldDismissDetail(130, 0.2, 800), true);
  assert.equal(shouldDismissDetail(30, 1, 800), true);
  assert.equal(shouldDismissDetail(80, 0.4, 800), false);
});

test('地点选择模式复用 Home 的唯一地图实例', async () => {
  const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  const homeSource = await readFile(new URL('../src/home/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /locationMode=\{locationPickerVisible\}/);
  assert.match(appSource, /mapAlreadyMounted/);
  assert.doesNotMatch(appSource, /!locationPickerVisible && <HomeScreen/);
  assert.match(appSource, /locationPickerOriginCamera/);
  assert.match(appSource, /setHomeViewport\(\{ camera: origin \}\)/);
  assert.match(homeSource, /locationOverlay/);
  assert.match(homeSource, /showStatus=\{false\}/);
});

test('正式 Home 在地图与时间轴之间使用单层独立安静区并将时间轴下移 50px', async () => {
  const [homeSource, quietZoneSource] = await Promise.all([
    readFile(new URL('../src/home/HomeScreen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/home/TimelineQuietZone.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(homeSource, /<TimelineQuietZone \/>/);
  assert.match(homeSource, /const TIMELINE_VERTICAL_OFFSET = 50/);
  assert.match(homeSource, /transform: \[\{ translateY: TIMELINE_VERTICAL_OFFSET \}\]/);
  assert.match(homeSource, /map: \{[\s\S]*zIndex: 2/);
  assert.match(homeSource, /overlay: \{[\s\S]*zIndex: 4/);
  assert.match(homeSource, /status\?\.includes\('诊断：'\) \? undefined : status/);
  assert.match(quietZoneSource, /TIMELINE_QUIET_ZONE_SCREEN_RATIO = 0\.3/);
  assert.match(quietZoneSource, /rgba\(247,245,239,0\.55\)/);
  assert.doesNotMatch(quietZoneSource, /RadialGradient/);
  assert.match(quietZoneSource, /pointerEvents="none"/);
  assert.match(quietZoneSource, /zIndex: 3/);
  assert.doesNotMatch(quietZoneSource, /Blur|WebView|MemoraeMap/);
});

test('远端照片同步完成后批量刷新缩略图，不逐张重建地图 Marker', async () => {
  const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /onPhotoStored/);
  assert.doesNotMatch(appSource, /Promise\.race\(\[download/);
  assert.match(appSource, /refreshMemories\(activeSession, \{ loadThumbnails: false \}\)/);
  assert.match(appSource, /return refreshMemories\(activeSession\)/);
});

test('正式 App 只把有效地点坐标送入本地地图，不把正文或照片传入 Marker', async () => {
  const source = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(source, /memory\.location/);
  assert.match(source, /MemoryMapThumbnail/);
  assert.match(source, /memoriesToMapMarkers/);
  assert.match(source, /firstPhotoCoordinates/);
  assert.match(source, /mobileLocationClient\.convertGps/);
  assert.match(source, /provider: 'amap'/);
  assert.match(source, /handleMarkerPress/);
  assert.doesNotMatch(source, /AmapJsWebViewMap|AmapWebViewMarker|AmapMapCamera/);
});

test('真实 MemoryV2 到地图 Marker 的适配只暴露坐标，并能反查详情', () => {
  const memory = (id: string, location: MemoryV2['location']): MemoryV2 => ({
    schemaVersion: 2,
    id,
    title: id,
    pastSelf: 'private body',
    presentSelf: '',
    date: '2026-08-23',
    category: 'travel',
    tag: '',
    pinnedBy: 'pin',
    board: { px: 20, py: 20, rotation: 0 },
    location,
    photos: [],
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  });
  const withCoordinates = memory('with-coordinates', {
    name: '真实地点',
    mx: 50,
    my: 50,
    lat: 44.1412,
    lng: 115.71314,
    provider: 'amap',
  });
  const withoutCoordinates = memory('without-coordinates', {
    name: '旧地点',
    mx: 50,
    my: 50,
  });

  assert.deepEqual(memoriesToMapMarkers([withCoordinates, withoutCoordinates]), [
    { id: 'with-coordinates', latitude: 44.1412, longitude: 115.71314 },
  ]);
  assert.equal(findMemoryForMarker([withCoordinates], 'with-coordinates'), withCoordinates);
  assert.equal(findMemoryForMarker([withCoordinates], 'missing'), null);
});

test('地图缩略图尺寸不再由照片数量决定，同省多段记忆按段数生成区域角标数据', () => {
  const memory = (id: string, lat: number, lng: number, photoCount: number): MemoryV2 => ({
    schemaVersion: 2,
    id,
    title: id,
    pastSelf: '',
    presentSelf: '',
    date: '2026-08-24',
    category: 'travel',
    tag: '',
    pinnedBy: 'pin',
    board: { px: 20, py: 20, rotation: 0 },
    location: {
      name: '宁波',
      mx: 50,
      my: 50,
      lat,
      lng,
      country: '中国',
      province: '浙江省',
      city: '宁波市',
    },
    photos: Array.from({ length: photoCount }, (_, index) => ({ id: `${id}-photo-${index}`, mimeType: 'image/jpeg' })),
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  });
  const memories = [
    memory('memory-a', 29.8683, 121.544, 1),
    memory('memory-b', 29.872, 121.55, 3),
    memory('memory-c', 29.88, 121.56, 6),
  ];
  const markers = memoriesToMapMarkers(memories, {
    'memory-a': [{ uri: 'memorae-thumbnail:///thumb-a', cacheKey: 'thumb-a' }],
    'memory-b': [
      { uri: 'memorae-thumbnail:///thumb-b', cacheKey: 'thumb-b' },
      { uri: 'memorae-thumbnail:///thumb-c', cacheKey: 'thumb-c' },
    ],
    'memory-c': [
      { uri: 'memorae-thumbnail:///thumb-d', cacheKey: 'thumb-d' },
      { uri: 'memorae-thumbnail:///thumb-e', cacheKey: 'thumb-e' },
    ],
  });

  assert.equal(markers.length, 3);
  assert.deepEqual(markers.map((marker) => marker.thumbnail), [
    { uri: 'memorae-thumbnail:///thumb-a', cacheKey: 'thumb-a' },
    { uri: 'memorae-thumbnail:///thumb-b', cacheKey: 'thumb-b' },
    { uri: 'memorae-thumbnail:///thumb-d', cacheKey: 'thumb-d' },
  ]);
  assert.ok(markers.every((marker) => !('scale' in marker) && !('photoCount' in marker) && !('thumbnailRefs' in marker)));

  const options = buildHomeRegionOptions(memories);
  assert.equal(HOME_CHINA_CAMERA.zoom, 3.5);
  assert.deepEqual(options.find((option) => option.key === 'country:中国')?.camera, HOME_CHINA_CAMERA);
  assert.equal(options.find((option) => option.key === 'province:中国:浙江省')?.memoryCount, 3);
  assert.equal(options.find((option) => option.key === 'city:中国:浙江省:宁波市')?.memoryCount, 3);
  const bounds = {
    northEast: { latitude: 31, longitude: 123 },
    southWest: { latitude: 28, longitude: 120 },
  };
  assert.equal(currentHomeRegionLabel({ camera: HOME_CHINA_CAMERA, bounds }, memories), '中国');
  assert.equal(currentHomeRegionLabel({ camera: { latitude: 30, longitude: 121.5, zoom: 6 }, bounds }, memories), '浙江');
  assert.equal(currentHomeRegionLabel({ camera: { latitude: 30, longitude: 121.5, zoom: 9 }, bounds }, memories), '浙江 · 宁波');
});

test('Home 地区选择接通真实视野和相机导航，不再使用占位提示', async () => {
  const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  const homeSource = await readFile(new URL('../src/home/HomeScreen.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /buildHomeRegionOptions/);
  assert.match(appSource, /currentHomeRegionLabel/);
  assert.match(appSource, /initialCamera=\{HOME_CHINA_CAMERA\}/);
  assert.match(appSource, /onRegionSelect=\{selectHomeRegion\}/);
  assert.doesNotMatch(appSource, /地区选择入口已保留/);
  assert.match(homeSource, /regionOptions\.map/);
  assert.match(homeSource, /memoryCount\} 段/);
});

test('本地 Runtime 不加载所忆远程页面，只从高德域名加载地图脚本', async () => {
  const source = await readFile(new URL('../src/map/amapRuntimeHtml.ts', import.meta.url), 'utf8');
  const html = buildAmapRuntimeHtml('web-key', 'security-code');
  assert.match(source, /https:\/\/webapi\.amap\.com\/maps/);
  assert.match(source, /script-src 'unsafe-inline' 'unsafe-eval'/);
  assert.match(source, /https:\/\/\*\.autonavi\.com/);
  assert.doesNotMatch(source, /memorae\.cn\/\?amap-runtime/);
  assert.match(source, /clearSensitiveData/);
  assert.match(source, /script\.onerror = \(\) => \{[\s\S]*clearTimeout\(scriptTimeout\)/);
  assert.equal(AMAP_JS_MAP_STYLE, 'amap://styles/86c653c12a194bd61f7e37008e400725');
  assert.match(html, /mapStyle: "amap:\/\/styles\/86c653c12a194bd61f7e37008e400725"/);
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
  assert.equal(tokyo.find((city) => city.id === '1850147')?.name, '东京');
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
  const parisContext = { kind: 'location-picker' as const, target: TEST_CITIES.巴黎 };
  assert.deepEqual(selectVisibleOverseasCities(CITY_LABEL_MIN_ZOOM - 0.1, {
    northEast: { latitude: 55, longitude: 10 },
    southWest: { latitude: 40, longitude: -5 },
  }, parisContext), []);
  assert.ok(selectVisibleOverseasCities(9.9, {
    northEast: { latitude: 55, longitude: 10 },
    southWest: { latitude: 40, longitude: -5 },
  }, parisContext).length > 0);
  assert.ok(selectVisibleOverseasCities(8, {
    northEast: { latitude: 36.4, longitude: 140.5 },
    southWest: { latitude: 34.7, longitude: 138.5 },
  }, { kind: 'memory', target: TEST_CITIES.东京 }).length > 0);
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
  assert.equal(OVERSEAS_CITIES.length, OVERSEAS_CITY_SOURCE_COUNT);
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
