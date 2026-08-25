import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

import {
  generateCrystalPath,
  insetCrystalGeometry,
} from '../src/testing/crystalTimelineGoldenGeometry';
import {
  GOLDEN_CRYSTAL_PRESET,
  GOLDEN_LAYER_ORDER,
  cloneGoldenLayerState,
} from '../src/testing/crystalTimelineGoldenPreset';

test('Golden Frame 冻结静态 2021 基准、轻量轨道和独立材质层', () => {
  assert.equal(GOLDEN_CRYSTAL_PRESET.label, '2021');
  assert.equal(GOLDEN_CRYSTAL_PRESET.referenceViewport.width, 390);
  assert.equal(GOLDEN_CRYSTAL_PRESET.referenceViewport.height, 844);
  assert.ok(GOLDEN_CRYSTAL_PRESET.layers.body.opacity < 0.5);
  assert.ok(GOLDEN_CRYSTAL_PRESET.track.lineWidth < 1);
  assert.ok(GOLDEN_CRYSTAL_PRESET.track.tickHeight < 10);
  assert.deepEqual(GOLDEN_LAYER_ORDER, [
    'track',
    'ticks',
    'years',
    'body',
    'outerRim',
    'innerRim',
    'softHighlight',
    'specularHighlight',
    'lowerShade',
    'label',
  ]);

  const cloned = cloneGoldenLayerState();
  cloned.body.opacity = 1;
  assert.notEqual(cloned.body.opacity, GOLDEN_CRYSTAL_PRESET.layers.body.opacity);
});

test('滑块轮廓由可调 Bézier Path 生成，不是固定圆角胶囊', () => {
  const geometry = GOLDEN_CRYSTAL_PRESET.geometry;
  const path = generateCrystalPath({ ...geometry, centerX: 195, centerY: 727 });
  assert.match(path, /^M /);
  assert.equal(path.match(/ C /g)?.length, 4);
  assert.match(path, / Z$/);

  const widerPath = generateCrystalPath({ ...geometry, width: geometry.width + 8, centerX: 195, centerY: 727 });
  assert.notEqual(widerPath, path);
  const inset = insetCrystalGeometry(geometry, 3);
  assert.ok(inset.width < geometry.width);
  assert.ok(inset.height < geometry.height);
});

test('Golden Frame 仅接入临时测试入口，并提供 Reference、Render、Overlay 与逐层调试', async () => {
  const [ordinaryEntry, testEntry, screen, renderer, formalTimeline, referenceAsset] = await Promise.all([
    readFile(new URL('../index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../index.e2e.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/testing/CrystalTimelineGoldenFrameScreen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/testing/CrystalTimelineGoldenRenderer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/home/timeline/CrystalTimeline.tsx', import.meta.url), 'utf8'),
    stat(new URL('../assets/golden-frame/crystal-timeline-reference.png', import.meta.url)),
  ]);

  assert.doesNotMatch(ordinaryEntry, /GoldenFrame|crystal-timeline-reference/);
  assert.match(testEntry, /CrystalTimelineGoldenFrameScreen/);
  assert.doesNotMatch(formalTimeline, /GoldenFrame|GOLDEN_CRYSTAL_PRESET/);
  assert.ok(referenceAsset.size > 1_000_000);

  assert.match(screen, /reference: 'Reference'/);
  assert.match(screen, /render: 'Render'/);
  assert.match(screen, /overlay: 'Overlay'/);
  assert.match(screen, /useState\(0\.5\)/);
  assert.match(screen, /Layer Debug/);
  assert.match(screen, /Geometry/);
  assert.match(screen, /Lighting/);

  assert.match(renderer, /<Path path=\{outline\}>/);
  assert.match(renderer, /visibleOpacity\(layers, 'body'\)/);
  assert.match(renderer, /visibleOpacity\(layers, 'outerRim'\)/);
  assert.match(renderer, /visibleOpacity\(layers, 'innerRim'\)/);
  assert.match(renderer, /visibleOpacity\(layers, 'softHighlight'\)/);
  assert.match(renderer, /visibleOpacity\(layers, 'specularHighlight'\)/);
  assert.match(renderer, /visibleOpacity\(layers, 'lowerShade'\)/);
  assert.doesNotMatch(renderer, /useSharedValue|withSpring|Gesture\./);
});
