import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ARC_TIMELINE_PIXELS_PER_YEAR,
  ARC_TIMELINE_GESTURE_SPEED,
  ARC_TIMELINE_GESTURE_PENDING,
  ARC_TIMELINE_GESTURE_HORIZONTAL,
  ARC_TIMELINE_GESTURE_CREATE,
  ARC_TIMELINE_GESTURE_RESET_MAP,
  RESET_PULL_ACTIVATION_DISTANCE,
  resetPullDisplayDistance,
  arcTimelineMaxDragYears,
  arcTimelineButtonIndex,
  arcTimelineIndexFromDrag,
  clampArcTimelineIndex,
  nearestCyclicArcTimelineIndex,
  projectedArcTimelineIndex,
  resolveArcTimelineEdgeDirection,
  resolveArcTimelineGestureMode,
  visualArcTimelineDragOffset,
  wrapArcTimelineYearIndex,
} from '../src/testing/arcTimelineModel';

test('弧形时间轴左拖进入更早年份，右拖进入更晚年份', () => {
  assert.equal(ARC_TIMELINE_GESTURE_SPEED, 3);
  assert.equal(arcTimelineIndexFromDrag(3, -ARC_TIMELINE_PIXELS_PER_YEAR), 2);
  assert.equal(arcTimelineIndexFromDrag(3, ARC_TIMELINE_PIXELS_PER_YEAR), 4);
});

test('边缘自动滚动的帧增量不会被下一次拖动事件回写抹掉', () => {
  const startIndex = 3;
  const translationX = ARC_TIMELINE_PIXELS_PER_YEAR * 1.2;
  const edgeScrollYears = 0.25;
  assert.equal(
    arcTimelineIndexFromDrag(startIndex, translationX, ARC_TIMELINE_PIXELS_PER_YEAR, edgeScrollYears),
    4.45,
  );
});

test('弧形时间轴使用有限惯性预测并吸附到有效年份', () => {
  assert.equal(projectedArcTimelineIndex(3.1, -800, 7), 2);
  assert.equal(projectedArcTimelineIndex(3.1, 800, 7), 4);
  assert.equal(projectedArcTimelineIndex(3.1, 0, 7), 3);
  assert.equal(clampArcTimelineIndex(-1, 7), 0);
  assert.equal(clampArcTimelineIndex(7, 7), 6);
});

test('弧形时间轴高亮按钮当前位置对应的年份，而不是时间轴中心年份', () => {
  assert.equal(arcTimelineButtonIndex(3, -1, 7), 2);
  assert.equal(arcTimelineButtonIndex(2, -1, 7), 1);
  assert.equal(arcTimelineButtonIndex(0, -1, 7), 6);
  assert.equal(arcTimelineButtonIndex(6, 1, 7), 0);
  assert.equal(projectedArcTimelineIndex(3 - 1, 0, 7), 2);
});

test('循环年份从最新年份右拖回到最早年份，正式入口跳过全部时间项', () => {
  assert.equal(wrapArcTimelineYearIndex(11, 11), 0);
  assert.equal(wrapArcTimelineYearIndex(-1, 11), 10);
  assert.equal(wrapArcTimelineYearIndex(11, 12, 1), 11);
  assert.equal(wrapArcTimelineYearIndex(0, 12, 1), 11);
  assert.equal(arcTimelineButtonIndex(11, 1, 12, 1.15, 1), 1);
  assert.equal(nearestCyclicArcTimelineIndex(1, 11.2, 12, 1), 12);
  assert.equal(nearestCyclicArcTimelineIndex(11, 0.2, 12, 1), 0);
});

test('弧形时间轴按钮到边缘后限位，年份索引与正式时间轴一致', () => {
  assert.equal(visualArcTimelineDragOffset(-10), -1.15);
  assert.equal(visualArcTimelineDragOffset(10), 1.15);
  assert.equal(visualArcTimelineDragOffset(0.4), 0.4);
});

test('弧形时间轴最大按钮位移按屏幕宽度计算，距边缘保留 50px', () => {
  const maximumDragYears = arcTimelineMaxDragYears(390);
  assert.ok(maximumDragYears > 2);
  assert.equal(arcTimelineButtonIndex(3, -10, 7, maximumDragYears), 1);
});

test('弧形时间轴边缘滚动使用回差，避免阈值附近反复启停', () => {
  assert.equal(resolveArcTimelineEdgeDirection(0, 1.2), 1);
  assert.equal(resolveArcTimelineEdgeDirection(1, 1.0), 1);
  assert.equal(resolveArcTimelineEdgeDirection(1, 0.8), 0);
  assert.equal(resolveArcTimelineEdgeDirection(0, -1.2), -1);
  assert.equal(resolveArcTimelineEdgeDirection(-1, -1.0), -1);
  assert.equal(resolveArcTimelineEdgeDirection(-1, -0.8), 0);
});

test('弧形时间轴方向锁定区分横向、上拉创建和下拉回到全景', () => {
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_PENDING, 4, 4), ARC_TIMELINE_GESTURE_PENDING);
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_PENDING, 30, 8), ARC_TIMELINE_GESTURE_HORIZONTAL);
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_PENDING, 8, -30), ARC_TIMELINE_GESTURE_CREATE);
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_PENDING, 8, 30), ARC_TIMELINE_GESTURE_RESET_MAP);
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_RESET_MAP, -80, -80), ARC_TIMELINE_GESTURE_RESET_MAP);
});

test('下拉回到全景使用阻尼位移和一次性激活阈值', () => {
  assert.equal(RESET_PULL_ACTIVATION_DISTANCE, 60);
  assert.equal(resetPullDisplayDistance(30), 30);
  assert.equal(resetPullDisplayDistance(100), 71.2);
  assert.equal(resetPullDisplayDistance(-100), 0);
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
  assert.match(component, /edgeScrollOffset/);
  assert.match(component, /arcTimelineIndexFromDrag\([\s\S]*edgeScrollOffset\.value/);
  assert.match(component, /const releaseVelocity = wasEdgeScrolling \? 0 : event\.velocityX/);
  assert.match(component, /const releaseVelocity = wasEdgeScrolling/);
  assert.match(component, /resolveArcTimelineEdgeDirection/);
  assert.match(component, /useAnimatedReaction/);
  assert.match(component, /useDerivedValue/);
  assert.match(component, /const highlightedIndex = useDerivedValue/);
  assert.match(component, /arcTimelineButtonIndex\(scrollIndex\.value, dragOffsetYears\.value/);
  assert.match(component, /highlightedTextStyle/);
  assert.doesNotMatch(component, /textShadowColor/);
  assert.match(component, /withTiming\(targetIndex, RETURN_CONFIG/);
  assert.match(component, /const buttonIndex = scrollIndex\.value \+ visualArcTimelineDragOffset\([\s\S]*dragOffsetYears\.value/);
  assert.match(component, /ARC_TIMELINE_GESTURE_SPEED/);
  assert.match(component, /edgeDirection\.value \* ARC_TIMELINE_EDGE_SCROLL_YEARS_PER_SECOND \* elapsedSeconds/);
  assert.match(component, /arcTimelineMaxDragYears\(width\)/);
  assert.match(component, /maximumDragYears \* 0\.74/);
  assert.match(component, /gestureStartIndex\.value,[\s\S]*0,[\s\S]*edgeScrollOffset\.value/);
  assert.match(component, /const \[displayIndex, setDisplayIndex\]/);
  assert.match(component, /years\[displayIndex\]/);
  assert.match(component, /wrapArcTimelineYearIndex/);
  assert.match(component, /nearestCyclicArcTimelineIndex/);
  assert.match(component, /<GestureDetector gesture=\{gesture\}>[\s\S]*accessibilityLabel="中心年份按钮"/);
  assert.doesNotMatch(component, /<GestureDetector gesture=\{gesture\}>[\s\S]*<View accessibilityLabel="弧形时间轴原型"/);
  assert.match(component, /Math\.sin\(angle\)/);
  assert.match(component, /Math\.cos\(angle\)/);
  assert.match(component, /Q \$\{width \/ 2\} 22/);
  assert.match(screen, /ArcTimelinePrototype/);
  assert.match(entry, /EXPO_PUBLIC_TIMELINE_PROTOTYPE/);
  assert.doesNotMatch(component, /MemoraeMap|HomeScreen|AMap|WebView/);
  assert.doesNotMatch(screen, /MemoraeMap|HomeScreen|AMap|WebView/);
});
