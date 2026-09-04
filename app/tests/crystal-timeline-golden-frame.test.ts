import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

import {
  generateCrystalPath,
  insetCrystalGeometry,
} from '../src/archive/crystal-timeline/goldenCrystalGeometry';
import {
  GOLDEN_CRYSTAL_PRESET,
  GOLDEN_LAYER_ORDER,
  cloneGoldenLayerState,
} from '../src/archive/crystal-timeline/goldenCrystalPreset';

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
    innerVolume: { enabled: true, opacity: 0.16 },
    outerRim: { enabled: true, opacity: 0.9 },
    innerRim: { enabled: true, opacity: 0.62 },
    softHighlight: { enabled: true, opacity: 0.44 },
    specularHighlight: { enabled: true, opacity: 0.84 },
    lowerShade: { enabled: true, opacity: 0.58 },
    label: { enabled: true, opacity: 0.92 },
  });
  assert.deepEqual(GOLDEN_LAYER_ORDER, [
    'track',
    'ticks',
    'years',
    'body',
    'innerVolume',
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

test('Golden Renderer 保持在测试链，正式 Timeline 使用弧形时间轴模型', async () => {
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
    readFile(new URL('../src/home/timeline/ArcTimeline.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/archive/crystal-timeline/CrystalRailCanvas.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/archive/crystal-timeline/GoldenCrystalVisual.tsx', import.meta.url), 'utf8'),
    stat(new URL('../assets/archive/crystal-timeline/crystal-timeline-reference.png', import.meta.url)),
  ]);

  assert.doesNotMatch(ordinaryEntry, /GoldenFrame|crystal-timeline-reference/);
  assert.match(testEntry, /CrystalTimelineGoldenFrameScreen/);
  assert.match(formalTimeline, /Gesture\.Pan\(\)/);
  assert.match(formalTimeline, /arcTimelineButtonIndex/);
  assert.match(formalTimeline, /arcTimelineIndexFromDrag/);
  assert.match(formalTimeline, /arcTimelineMaxDragYears/);
  assert.match(formalTimeline, /useFrameCallback/);
  assert.match(formalTimeline, /edgeDirection\.value \* ARC_EDGE_SCROLL_YEARS_PER_SECOND \* elapsedSeconds/);
  assert.match(formalTimeline, /useAnimatedReaction/);
  assert.match(formalTimeline, /withTiming\(1, RETURN_CONFIG/);
  assert.match(formalTimeline, /highlightedIndex/);
  assert.doesNotMatch(formalTimeline, /GOLDEN_CRYSTAL_PRESET|timelineVisualOffsetAroundLens|timelineLogicalOffsetFromVisual/);
  assert.match(formalTimeline, /item\.value === null/);
  assert.doesNotMatch(formalTimeline, /centerLabel/);
  assert.match(formalTimeline, /opacity: isHighlighted \? 1/);
  assert.match(formalTimeline, /zIndex: isHighlighted \? 2 : 0/);
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
  assert.match(sharedVisual, /goldenLayerOpacity\(layers, 'innerVolume'\)/);
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
  const innerVolumeBlock = sharedVisual.match(
    /<Group opacity=\{goldenLayerOpacity\(layers, 'innerVolume'\)\} clip=\{outline\}>([\s\S]*?)<\/Group>/,
  )?.[1] ?? '';
  const specularBlock = sharedVisual.match(
    /<Group opacity=\{goldenLayerOpacity\(layers, 'specularHighlight'\)\} clip=\{outline\}>([\s\S]*?)<\/Group>/,
  )?.[1] ?? '';
  const lowerRefractionBlock = sharedVisual.match(
    /<Group opacity=\{goldenLayerOpacity\(layers, 'lowerShade'\)\} clip=\{outline\}>([\s\S]*?)<\/Group>/,
  )?.[1] ?? '';
  assert.equal(outerRimBlock.match(/<Path/g)?.length, 2);
  assert.equal(innerRimBlock.match(/<Path/g)?.length, 1);
  assert.equal(innerVolumeBlock.match(/<Path/g)?.length, 1);
  assert.match(outerRimBlock, /rgba\(255,255,252,1\)/);
  assert.match(outerRimBlock, /rgba\(103,61,31,0\.98\)/);
  assert.match(innerRimBlock, /rgba\(255,252,245,0\.88\)/);
  assert.match(innerRimBlock, /rgba\(126,82,49,0\.68\)/);
  assert.match(innerVolumeBlock, /rgba\(100,61,34,0\.5\)/);
  assert.doesNotMatch(innerVolumeBlock, /rgba\(255,255,255/);
  assert.match(specularBlock, /rgba\(255,255,255,0\.99\)/);
  assert.match(lowerRefractionBlock, /rgba\(135,77,29,0\.82\)/);
  assert.doesNotMatch(sharedVisual, /useSharedValue|useDerivedValue|usePathValue|withSpring|Gesture\./);
});

test('正式中心年份按钮以互斥手势承载回到现在与上拉创建，并由 Home 展示全屏目标', async () => {
  const [timeline, mobileTimeline, home] = await Promise.all([
    readFile(new URL('../src/home/timeline/ArcTimeline.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/home/MobileTimeline.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/home/HomeScreen.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(timeline, /Gesture\.Tap\(\)[\s\S]*\.numberOfTaps\(2\)/);
  assert.match(timeline, /Gesture\.Exclusive\(doubleTapGesture, panGesture\)/);
  assert.match(timeline, /const currentYear = String\(new Date\(\)\.getFullYear\(\)\)/);
  assert.match(timeline, /withSpring\(currentYearTargetIndex, SPRING_CONFIG\)/);
  assert.match(timeline, /onSelect\(currentYear\)/);
  assert.match(timeline, /resolveArcTimelineGestureMode/);
  assert.match(timeline, /resolveCreatePullRelease/);
  assert.match(timeline, /scheduleOnRN\(triggerCreateOnce\)/);
  assert.match(timeline, /Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Light\)/);
  assert.doesNotMatch(timeline, /setInterval|setTimeout|from 'react-native'.*Animated/);
  const createReleaseBranch = timeline.match(
    /if \(resolvedMode === ARC_TIMELINE_GESTURE_CREATE\) \{([\s\S]*?)if \(resolvedMode !== ARC_TIMELINE_GESTURE_HORIZONTAL\)/,
  )?.[1] ?? '';
  assert.doesNotMatch(createReleaseBranch, /commitIndex|onSelect/);

  assert.match(mobileTimeline, /onCreateMemory/);
  assert.match(mobileTimeline, /createPullProgress/);
  assert.match(home, /useSharedValue\(0\)/);
  assert.match(home, />新建记忆<\/Animated\.Text>/);
  assert.match(home, /CREATE_OVERLAY_MAX_OPACITY/);
  assert.match(home, /onCreateMemory=\{onCreateMemory\}/);
  assert.doesNotMatch(home, /styles\.createButton|styles\.createPlus|styles\.createPressed/);
});
