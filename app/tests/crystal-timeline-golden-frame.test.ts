import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

import {
  generateCrystalPath,
  insetCrystalGeometry,
} from '../src/home/timeline/goldenCrystalGeometry';
import {
  GOLDEN_CRYSTAL_PRESET,
  GOLDEN_LAYER_ORDER,
  cloneGoldenLayerState,
} from '../src/home/timeline/goldenCrystalPreset';

test('Golden Frame 冻结静态 2021 基准、轻量轨道和独立材质层', () => {
  assert.equal(GOLDEN_CRYSTAL_PRESET.label, '2021');
  assert.equal(GOLDEN_CRYSTAL_PRESET.referenceViewport.width, 390);
  assert.equal(GOLDEN_CRYSTAL_PRESET.referenceViewport.height, 844);
  assert.deepEqual(GOLDEN_CRYSTAL_PRESET.geometry, {
    width: 88,
    height: 58,
    leftBulge: 1.4,
    rightBulge: 1.8,
    topCurve: 0.14,
    bottomCurve: 0.17,
    shoulderTightness: 0.11,
    verticalAsymmetry: 1.2,
  });
  assert.deepEqual(GOLDEN_CRYSTAL_PRESET.lighting, {
    softHighlightY: -17.2,
    softHighlightBlur: 0.9,
    specularY: -19.3,
    lowerShadeY: 18.5,
    lowerShadeBlur: 0.8,
  });
  assert.deepEqual(GOLDEN_CRYSTAL_PRESET.track, {
    centerYRatio: 0.8615,
    glassHeight: 44,
    lineWidth: 0.78,
    tickHeight: 8.5,
    tickWidth: 0.62,
  });
  assert.deepEqual(GOLDEN_CRYSTAL_PRESET.yearOffsets, [-168, -116, -64, 0, 66, 118, 170]);
  assert.deepEqual(GOLDEN_CRYSTAL_PRESET.layers, {
    track: { enabled: true, opacity: 0.72 },
    ticks: { enabled: true, opacity: 0.68 },
    years: { enabled: true, opacity: 0.72 },
    body: { enabled: true, opacity: 0.34 },
    outerRim: { enabled: true, opacity: 0.76 },
    innerRim: { enabled: true, opacity: 0.48 },
    softHighlight: { enabled: true, opacity: 0.44 },
    specularHighlight: { enabled: true, opacity: 0.7 },
    lowerShade: { enabled: true, opacity: 0.38 },
    label: { enabled: true, opacity: 0.92 },
  });
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

test('Golden Renderer 由测试页与正式 Timeline 共用，正式手势不驱动形变和动态光照', async () => {
  const [
    ordinaryEntry,
    testEntry,
    screen,
    renderer,
    formalTimeline,
    formalCanvas,
    sharedVisual,
    referenceAsset,
  ] = await Promise.all([
    readFile(new URL('../index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../index.e2e.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/testing/CrystalTimelineGoldenFrameScreen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/testing/CrystalTimelineGoldenRenderer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/home/timeline/CrystalTimeline.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/home/timeline/CrystalRailCanvas.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/home/timeline/GoldenCrystalVisual.tsx', import.meta.url), 'utf8'),
    stat(new URL('../assets/golden-frame/crystal-timeline-reference.png', import.meta.url)),
  ]);

  assert.doesNotMatch(ordinaryEntry, /GoldenFrame|crystal-timeline-reference/);
  assert.match(testEntry, /CrystalTimelineGoldenFrameScreen/);
  assert.match(formalTimeline, /GOLDEN_CRYSTAL_PRESET/);
  assert.match(formalTimeline, /timelineVisualOffsetAroundLens/);
  assert.match(formalTimeline, /timelineLogicalOffsetFromVisual/);
  assert.match(formalTimeline, /Gesture\.Pan\(\)/);
  assert.match(formalTimeline, /translateX\.value = withSpring/);
  assert.doesNotMatch(formalTimeline, /pressProgress|snapProgress|highlightOffsetX|withTiming|withSequence/);
  assert.match(formalCanvas, /GoldenCrystalTrackLayers/);
  assert.match(formalCanvas, /GoldenCrystalMaterialLayers/);
  assert.doesNotMatch(formalCanvas, /useSharedValue|useDerivedValue|usePathValue|SharedValue/);
  assert.ok(referenceAsset.size > 1_000_000);

  assert.match(screen, /reference: 'Reference'/);
  assert.match(screen, /render: 'Render'/);
  assert.match(screen, /overlay: 'Overlay'/);
  assert.match(screen, /useState\(0\.5\)/);
  assert.match(screen, /Layer Debug/);
  assert.match(screen, /Geometry/);
  assert.match(screen, /Lighting/);

  assert.match(renderer, /GoldenCrystalTrackLayers/);
  assert.match(renderer, /GoldenCrystalMaterialLayers/);
  assert.doesNotMatch(renderer, /useSharedValue|withSpring|Gesture\./);

  assert.match(sharedVisual, /<Path path=\{outline\}>/);
  assert.match(sharedVisual, /goldenLayerOpacity\(layers, 'body'\)/);
  assert.match(sharedVisual, /goldenLayerOpacity\(layers, 'outerRim'\)/);
  assert.match(sharedVisual, /goldenLayerOpacity\(layers, 'innerRim'\)/);
  assert.match(sharedVisual, /goldenLayerOpacity\(layers, 'softHighlight'\)/);
  assert.match(sharedVisual, /goldenLayerOpacity\(layers, 'specularHighlight'\)/);
  assert.match(sharedVisual, /goldenLayerOpacity\(layers, 'lowerShade'\)/);
  const outerRimBlock = sharedVisual.match(
    /<Group opacity=\{goldenLayerOpacity\(layers, 'outerRim'\)\}>([\s\S]*?)<\/Group>/,
  )?.[1] ?? '';
  const innerRimBlock = sharedVisual.match(
    /<Group opacity=\{goldenLayerOpacity\(layers, 'innerRim'\)\}>([\s\S]*?)<\/Group>/,
  )?.[1] ?? '';
  assert.equal(outerRimBlock.match(/<Path/g)?.length, 2);
  assert.equal(innerRimBlock.match(/<Path/g)?.length, 1);
  assert.match(outerRimBlock, /rgba\(255,255,252,0\.98\)/);
  assert.match(outerRimBlock, /rgba\(103,61,31,0\.82\)/);
  assert.match(innerRimBlock, /rgba\(255,252,245,0\.8\)/);
  assert.match(innerRimBlock, /rgba\(126,82,49,0\.52\)/);
  assert.doesNotMatch(sharedVisual, /useSharedValue|useDerivedValue|usePathValue|withSpring|Gesture\./);
});
