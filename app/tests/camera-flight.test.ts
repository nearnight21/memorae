import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { buildAmapRuntimeHtml } from '../src/map/amapRuntimeHtml';

// Execute the production camera code with a deterministic clock and SDK boundary.
// This verifies commands/events, not WKWebView rendering performance.
function runtime(userAgent: string) {
  let now = 0;
  let camera = { lat: 35, lng: 104, zoom: 6 };
  let frames: Array<() => void> = [];
  const timers: Array<{ at: number; fn: () => void }> = [];
  const events: Array<{ type: string; lat?: number; lng?: number; zoom?: number }> = [];
  const updates: Array<typeof camera> = [];
  const handlers: Record<string, () => void> = {};
  const map = {
    getCenter: () => ({ getLat: () => camera.lat, getLng: () => camera.lng }),
    getZoom: () => camera.zoom,
    on: (name: string, fn: () => void) => { handlers[name] = fn; },
    setZoomAndCenter: (zoom: number, [lng, lat]: number[], immediate: boolean) => {
      // A timed SDK move is allowed to remain unfinished; a wall timer cannot
      // prove that the renderer reached its target.
      if (!immediate) return;
      camera = { lat, lng, zoom };
      updates.push({ ...camera });
      handlers.moveend?.();
      handlers.zoomend?.();
    },
  };
  const html = buildAmapRuntimeHtml('test', 'test');
  const code = html.slice(html.indexOf('const cameraCenter ='), html.indexOf('const fallbackPhoto ='));
  const subscriptions = html.match(/map\.on\('(movestart|moveend|zoomstart|zoomend)'[^\n]+/g)!.join('\n');
  const api = runInNewContext(`${code}\n${subscriptions}\n({ setCamera, cancelCameraFlight })`, {
    map, navigator: { userAgent }, render() {}, post: (event: typeof events[number]) => events.push(event),
    window: {
      performance: { now: () => now },
      requestAnimationFrame: (fn: () => void) => frames.push(fn),
      setTimeout: (fn: () => void, delay: number) => { timers.push({ at: now + delay, fn }); return timers.length; },
      clearTimeout: (id: number) => { if (timers[id - 1]) timers[id - 1].fn = () => {}; },
    },
  });
  return { api, events, updates, get camera() { return camera; },
    tick(time: number) {
      now = time;
      const batch = frames; frames = []; batch.forEach((fn) => fn());
      timers.filter((timer) => timer.at <= now).splice(0).forEach((timer) => {
        timer.at = Infinity; timer.fn();
      });
    },
  };
}

function appHandlers() {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  function handleMarkerPress('), source.indexOf('  function handleMapPointPress('));
  const opened: unknown[] = [];
  const timers: Array<() => void> = [];
  let target: { latitude: number; longitude: number; zoom: number } | null = null;
  const memory = { id: 'm', location: { lat: 39.9, lng: 116.4 } };
  const context = {
    memories: [memory], findMemoryForMarker: () => memory,
    homeViewport: { camera: { latitude: 35, longitude: 104, zoom: 6 } },
    pendingOpenMemoryRef: { current: null }, detailReturnCameraRef: { current: null },
    setStatus() {}, setIsMapMoving() {}, setHomeViewport() {}, setLocationCameraTarget() {},
    setHomeCameraTarget: (value: typeof target) => { target = value; },
    setTimeout: (fn: () => void) => timers.push(fn),
    runTask: (fn: () => void) => fn(), openMemory: (value: unknown) => opened.push(value),
  };
  const api = runInNewContext(ts.transpileModule(`${body}\n({ handleMarkerPress, handleHomeCameraIdle, restoreDetailCamera })`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { api, opened, timers, get target() { return target; } };
}

test('iOS 与 Android 的中间相机帧及到位事件一致', () => {
  const ios = runtime('iPhone'); const android = runtime('Android');
  for (const runner of [ios, android]) runner.api.setCamera(9, 116.4, 39.9, true);
  for (const time of [150, 300, 450, 600, 616]) { ios.tick(time); android.tick(time); }
  assert.ok(android.updates.length >= 4);
  assert.deepEqual(ios.updates, android.updates);
  assert.deepEqual(JSON.parse(JSON.stringify(ios.events)), JSON.parse(JSON.stringify(android.events)));
  assert.deepEqual(ios.camera, { lat: 39.9, lng: 116.4, zoom: 9 });
  assert.equal(ios.events.filter((event) => event.type === 'cameraIdle').length, 1);
});

test('等待镜头期间不能因 750ms 已过就打开详情', () => {
  const app = appHandlers();
  app.api.handleMarkerPress({ markerId: 'm' });
  app.timers.forEach((fn) => fn());
  assert.equal(app.opened.length, 0);
});

test('旧相机停稳或只到达坐标但未完成缩放，不能打开详情或清除目标', () => {
  const app = appHandlers();
  app.api.handleMarkerPress({ markerId: 'm' });
  const target = app.target;
  for (const camera of [{ latitude: 35, longitude: 104, zoom: 6 }, { ...target, zoom: 6 }]) {
    app.api.handleHomeCameraIdle({ camera });
    assert.equal(app.opened.length, 0);
    assert.deepEqual(app.target, target);
  }
  app.api.handleHomeCameraIdle({ camera: target });
  app.api.handleHomeCameraIdle({ camera: target });
  assert.equal(app.opened.length, 1);
  app.api.restoreDetailCamera();
  assert.equal(app.target?.latitude, 35);
  assert.equal(app.target?.longitude, 104);
});

test('取消或新目标覆盖旧飞行时，旧帧不能发出停稳', () => {
  const runner = runtime('iPhone');
  runner.api.setCamera(9, 116.4, 39.9, true); runner.tick(150);
  runner.api.setCamera(9, 121.5, 31.2, true);
  runner.tick(600);
  assert.equal(runner.events.filter((event) => event.type === 'cameraIdle').length, 0);
  runner.tick(750); runner.tick(766);
  assert.deepEqual(runner.camera, { lat: 31.2, lng: 121.5, zoom: 9 });
  assert.equal(runner.events.filter((event) => event.type === 'cameraIdle').length, 1);
});
