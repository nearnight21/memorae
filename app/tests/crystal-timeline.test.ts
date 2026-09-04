import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARC_TIMELINE_GESTURE_CREATE,
  ARC_TIMELINE_GESTURE_HORIZONTAL,
  ARC_TIMELINE_GESTURE_PENDING,
  buildTimelineItems,
  clampTimelineIndex,
  commitTimelineSelection,
  createPullDisplayDistance,
  createPullProgress,
  filterMemoriesByTimelineYear,
  isCreatePullArmed,
  projectedTimelineIndex,
  resistedTimelineOffset,
  resolveArcTimelineGestureMode,
  resolveCreatePullRelease,
  timelineIndexForOffset,
  timelineIndexForSelection,
  timelineLogicalOffsetFromVisual,
  timelineOffsetForIndex,
  timelineVisualOffsetAroundLens,
  TIMELINE_EDGE_RESISTANCE,
  TIMELINE_ITEM_WIDTH,
  TIMELINE_VELOCITY_PROJECTION_SECONDS,
} from '../src/home/timeline/timelineModel';
import {
  CRYSTAL_HOME_BOTTOM_PADDING,
  CRYSTAL_LENS_HEIGHT,
  CRYSTAL_LENS_WIDTH,
  CRYSTAL_RAIL_CORE_HEIGHT,
  CRYSTAL_RAIL_HEIGHT,
  crystalRailBottomDistance,
} from '../src/archive/crystal-timeline/crystalTimelineGeometry';
import { GOLDEN_CRYSTAL_PRESET } from '../src/archive/crystal-timeline/goldenCrystalPreset';

test('水晶时间轴冻结 390×844 验收几何，不回退为过大滑块或细线导轨', () => {
  assert.equal(CRYSTAL_LENS_WIDTH, 88);
  assert.equal(CRYSTAL_LENS_HEIGHT, 58);
  assert.equal(CRYSTAL_RAIL_HEIGHT, 44);
  assert.equal(CRYSTAL_RAIL_CORE_HEIGHT, 0.78);
  assert.equal(CRYSTAL_HOME_BOTTOM_PADDING, 48);
  assert.equal(crystalRailBottomDistance(), 97);
});

test('水晶时间轴使用真实年份补齐自然年并保留全部时间，不生成未来年份', () => {
  const items = buildTimelineItems(['2021', '2024', 'not-a-year', '2028'], 2026, 7);
  assert.deepEqual(items.map((item) => item.value), [
    null,
    '2020',
    '2021',
    '2022',
    '2023',
    '2024',
    '2025',
    '2026',
  ]);
  assert.equal(items.some((item) => item.value === '2027' || item.value === '2028'), false);
  assert.deepEqual(buildTimelineItems([], 2026, 3).map((item) => item.value), [
    null,
    '2024',
    '2025',
    '2026',
  ]);
});

test('年份索引和时间轴 offset 可以双向换算', () => {
  assert.equal(timelineOffsetForIndex(3, TIMELINE_ITEM_WIDTH), -3 * TIMELINE_ITEM_WIDTH);
  assert.equal(timelineIndexForOffset(-3 * TIMELINE_ITEM_WIDTH, 8, TIMELINE_ITEM_WIDTH), 3);
  assert.equal(timelineIndexForSelection(buildTimelineItems(['2022'], 2026), '2024'), 5);
  assert.equal(timelineIndexForSelection(buildTimelineItems(['2022'], 2026), null), 0);
});

test('正式手势保留 82dp 逻辑吸附，静态年份坐标映射到 Golden 基准', () => {
  assert.equal(TIMELINE_ITEM_WIDTH, 82);
  const leftNeighbor = GOLDEN_CRYSTAL_PRESET.yearOffsets[2];
  const rightNeighbor = GOLDEN_CRYSTAL_PRESET.yearOffsets[4];
  const outerStep = GOLDEN_CRYSTAL_PRESET.yearOffsets[1]
    - GOLDEN_CRYSTAL_PRESET.yearOffsets[0];
  const logicalOffsets = [-3, -2, -1, 0, 1, 2, 3]
    .map((index) => index * TIMELINE_ITEM_WIDTH);
  const visualOffsets = logicalOffsets.map((offset) => timelineVisualOffsetAroundLens(
    offset,
    TIMELINE_ITEM_WIDTH,
    leftNeighbor,
    rightNeighbor,
    outerStep,
  ));

  assert.deepEqual(visualOffsets, GOLDEN_CRYSTAL_PRESET.yearOffsets);
  assert.deepEqual(visualOffsets.map((offset) => timelineLogicalOffsetFromVisual(
    offset,
    TIMELINE_ITEM_WIDTH,
    leftNeighbor,
    rightNeighbor,
    outerStep,
  )), logicalOffsets);
});

test('松手时结合速度预测吸附年份并限制最早最晚边界', () => {
  assert.equal(projectedTimelineIndex(
    -TIMELINE_ITEM_WIDTH,
    -800,
    8,
    TIMELINE_ITEM_WIDTH,
    TIMELINE_VELOCITY_PROJECTION_SECONDS,
  ), 2);
  assert.equal(projectedTimelineIndex(
    -TIMELINE_ITEM_WIDTH,
    800,
    8,
    TIMELINE_ITEM_WIDTH,
    TIMELINE_VELOCITY_PROJECTION_SECONDS,
  ), 0);
  assert.equal(projectedTimelineIndex(
    -9999,
    -1200,
    8,
    TIMELINE_ITEM_WIDTH,
    TIMELINE_VELOCITY_PROJECTION_SECONDS,
  ), 7);
  assert.equal(clampTimelineIndex(-4, 8), 0);
  assert.equal(clampTimelineIndex(99, 8), 7);
});

test('拖过真实边界时应用阻尼，边界内保持原始位移', () => {
  const minimum = -4 * TIMELINE_ITEM_WIDTH;
  assert.equal(
    resistedTimelineOffset(
      -2 * TIMELINE_ITEM_WIDTH,
      5,
      TIMELINE_ITEM_WIDTH,
      TIMELINE_EDGE_RESISTANCE,
    ),
    -2 * TIMELINE_ITEM_WIDTH,
  );
  assert.ok(Math.abs(resistedTimelineOffset(
    100,
    5,
    TIMELINE_ITEM_WIDTH,
    TIMELINE_EDGE_RESISTANCE,
  ) - 28) < 0.000001);
  assert.ok(Math.abs(resistedTimelineOffset(
    minimum - 100,
    5,
    TIMELINE_ITEM_WIDTH,
    TIMELINE_EDGE_RESISTANCE,
  ) - (minimum - 28)) < 0.000001);
});

test('同一松手结果不会重复提交年份，全部时间仍以 null 提交', () => {
  const committed: Array<string | null> = [];
  assert.equal(commitTimelineSelection('2024', '2024', (value) => committed.push(value)), false);
  assert.equal(commitTimelineSelection('2024', '2025', (value) => committed.push(value)), true);
  assert.equal(commitTimelineSelection('2025', null, (value) => committed.push(value)), true);
  assert.deepEqual(committed, ['2025', null]);
});

test('年份筛选包含选中年份及其之前的记忆', () => {
  const memories = [
    { id: 'before', date: '2022-05-01' },
    { id: 'selected', date: '2024-01-02' },
    { id: 'after', date: '2025-12-31' },
  ];
  assert.deepEqual(
    filterMemoriesByTimelineYear(memories, '2024').map((memory) => memory.id),
    ['before', 'selected'],
  );
  assert.deepEqual(filterMemoriesByTimelineYear(memories, null), memories);
});

test('弧形时间轴先锁定横向或向上创建方向，小幅抖动和下拉不进入创建', () => {
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_PENDING, 4, -5), ARC_TIMELINE_GESTURE_PENDING);
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_PENDING, 28, -8), ARC_TIMELINE_GESTURE_HORIZONTAL);
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_PENDING, 8, -28), ARC_TIMELINE_GESTURE_CREATE);
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_PENDING, 2, 40), ARC_TIMELINE_GESTURE_PENDING);
  assert.equal(resolveArcTimelineGestureMode(ARC_TIMELINE_GESTURE_HORIZONTAL, 2, -80), ARC_TIMELINE_GESTURE_HORIZONTAL);
  assert.equal(createPullProgress(ARC_TIMELINE_GESTURE_HORIZONTAL, -200), 0);
});

test('向上拉越过阈值后进入 armed，退回阈值以下恢复并在阈值后增加阻尼', () => {
  assert.equal(isCreatePullArmed(ARC_TIMELINE_GESTURE_CREATE, -111), false);
  assert.equal(isCreatePullArmed(ARC_TIMELINE_GESTURE_CREATE, -112), true);
  assert.equal(isCreatePullArmed(ARC_TIMELINE_GESTURE_CREATE, -90), false);
  assert.equal(createPullProgress(ARC_TIMELINE_GESTURE_CREATE, -56), 0.5);
  assert.equal(createPullProgress(ARC_TIMELINE_GESTURE_CREATE, -160), 1);
  assert.equal(createPullDisplayDistance(-112), 112);
  assert.ok(createPullDisplayDistance(-212) < 212);
});

test('Create Pull 未 armed 时取消，armed 松手只允许一次 create', () => {
  assert.equal(resolveCreatePullRelease(ARC_TIMELINE_GESTURE_CREATE, false, false), 'cancel');
  assert.equal(resolveCreatePullRelease(ARC_TIMELINE_GESTURE_CREATE, true, false), 'create');
  assert.equal(resolveCreatePullRelease(ARC_TIMELINE_GESTURE_CREATE, true, true), 'none');
  assert.equal(resolveCreatePullRelease(ARC_TIMELINE_GESTURE_HORIZONTAL, true, false), 'none');
  assert.equal(resolveCreatePullRelease(ARC_TIMELINE_GESTURE_PENDING, false, false), 'none');
});
