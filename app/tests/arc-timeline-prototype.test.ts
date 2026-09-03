import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ARC_TIMELINE_PIXELS_PER_YEAR,
  arcTimelineIndexFromDrag,
  nearestCyclicArcTimelineIndex,
  projectedArcTimelineIndex,
  visualArcTimelineDragOffset,
  wrapArcTimelineIndex,
} from '../src/testing/arcTimelineModel';

test('弧形时间轴左拖进入更早年份，右拖进入更晚年份', () => {
  assert.equal(arcTimelineIndexFromDrag(3, -ARC_TIMELINE_PIXELS_PER_YEAR), 2);
  assert.equal(arcTimelineIndexFromDrag(3, ARC_TIMELINE_PIXELS_PER_YEAR), 4);
});

test('弧形时间轴使用有限惯性预测并吸附到有效年份', () => {
  assert.equal(projectedArcTimelineIndex(3.1, -800, 7), 2);
  assert.equal(projectedArcTimelineIndex(3.1, 800, 7), 4);
  assert.equal(wrapArcTimelineIndex(-1, 7), 6);
  assert.equal(wrapArcTimelineIndex(7, 7), 0);
  assert.equal(nearestCyclicArcTimelineIndex(0, 6.2, 7), 7);
  assert.equal(nearestCyclicArcTimelineIndex(6, 0.2, 7), -1);
});

test('弧形时间轴按钮到边缘后限位，年份索引仍可循环推进', () => {
  assert.equal(visualArcTimelineDragOffset(-10), -1.15);
  assert.equal(visualArcTimelineDragOffset(10), 1.15);
  assert.equal(visualArcTimelineDragOffset(0.4), 0.4);
});

test('弧形时间轴原型独立于正式 Home 和地图入口', async () => {
  const [component, screen, entry] = await Promise.all([
    readFile(new URL('../src/testing/ArcTimelinePrototype.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/testing/ArcTimelinePrototypeScreen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /Gesture\.Pan\(\)/);
  assert.match(component, /withSpring\(targetIndex/);
  assert.match(component, /event\.velocityX/);
  assert.match(component, /projectedArcTimelineIndex/);
  assert.match(component, /useFrameCallback/);
  assert.match(component, /wrapArcTimelineIndex/);
  assert.match(component, /nearestCyclicArcTimelineIndex/);
  assert.match(component, /<GestureDetector gesture=\{gesture\}>[\s\S]*accessibilityLabel="中心年份按钮"/);
  assert.match(component, /Math\.sin\(angle\)/);
  assert.match(component, /Math\.cos\(angle\)/);
  assert.match(component, /Q \$\{width \/ 2\} 22/);
  assert.match(screen, /ArcTimelinePrototype/);
  assert.match(entry, /EXPO_PUBLIC_TIMELINE_PROTOTYPE/);
  assert.doesNotMatch(component, /MemoraeMap|HomeScreen|AMap|WebView/);
  assert.doesNotMatch(screen, /MemoraeMap|HomeScreen|AMap|WebView/);
});
