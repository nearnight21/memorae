import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  cameraZoomLabel,
  cameraCoordinateLabel,
  effectiveDefaultMapCamera,
  isVersionNewer,
  normalizeDefaultMapCamera,
  parseDefaultMapCamera,
} from '../src/settings/settingsModel';
import { HOME_CHINA_CAMERA } from '../src/map/homeMapModel';

test('默认地图视图校验坐标并限制为地图支持的 Zoom', () => {
  assert.deepEqual(effectiveDefaultMapCamera(null), HOME_CHINA_CAMERA);
  assert.deepEqual(normalizeDefaultMapCamera({ latitude: 31.2, longitude: 121.5, zoom: 16 }), {
    latitude: 31.2,
    longitude: 121.5,
    zoom: 14,
  });
  assert.equal(normalizeDefaultMapCamera({ latitude: 91, longitude: 121.5, zoom: 6 }), null);
  assert.equal(parseDefaultMapCamera('{broken'), null);
  assert.equal(cameraZoomLabel({ latitude: 31.2, longitude: 121.5, zoom: 4.5 }), 'Zoom 4.5');
  assert.equal(cameraCoordinateLabel({ latitude: 31.2, longitude: 121.5, zoom: 4.5 }), '31.20°N · 121.50°E');
  assert.equal(cameraCoordinateLabel({ latitude: -33.9, longitude: -151.2, zoom: 4.5 }), '33.90°S · 151.20°W');
});

test('检查更新按语义版本比较正式版本号', () => {
  assert.equal(isVersionNewer('0.1.1', '0.1.0'), true);
  assert.equal(isVersionNewer('v1.0.0', '0.9.9'), true);
  assert.equal(isVersionNewer('0.1.0', '0.1.0'), false);
  assert.equal(isVersionNewer('invalid', '0.1.0'), false);
});

test('App 更多入口接通设置、帮助、关于和引导重播', () => {
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const homeSource = readFileSync(new URL('../src/home/HomeScreen.tsx', import.meta.url), 'utf8');
  const preferenceSource = readFileSync(new URL('../src/settings/appPreferences.ts', import.meta.url), 'utf8');
  const screensSource = readFileSync(new URL('../src/settings/SettingsScreens.tsx', import.meta.url), 'utf8');

  assert.match(homeSource, /accessibilityLabel="打开更多菜单"/);
  assert.match(screensSource, /accessibilityLabel="打开设置"/);
  assert.match(screensSource, /accessibilityLabel="打开帮助"/);
  assert.match(screensSource, /accessibilityLabel="打开关于"/);
  assert.match(appSource, /effectiveDefaultMapCamera\(defaultMapCamera\)/);
  assert.match(appSource, /setHomeCameraTarget\(\{ \.\.\.activeDefaultMapCamera \}\)/);
  assert.match(appSource, /onboardingMode === 'replay'/);
  assert.match(preferenceSource, /SecureStore\.setItemAsync\(DEFAULT_MAP_CAMERA_KEY/);
  assert.match(screensSource, /在地图上重新设置/);
  assert.match(screensSource, /重新查看使用引导/);
  assert.match(screensSource, /检查更新/);
  assert.match(screensSource, /支持开发者/);
});
