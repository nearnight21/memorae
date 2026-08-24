import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTimelineItems,
  clampTimelineIndex,
  commitTimelineSelection,
  projectedTimelineIndex,
  resistedTimelineOffset,
  timelineIndexForOffset,
  timelineIndexForSelection,
  timelineOffsetForIndex,
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
} from '../src/home/timeline/crystalTimelineGeometry';

test('水晶时间轴冻结 390×844 验收几何，不回退为过大滑块或细线导轨', () => {
  assert.equal(CRYSTAL_LENS_WIDTH, 52);
  assert.equal(CRYSTAL_LENS_HEIGHT, 38);
  assert.equal(CRYSTAL_RAIL_HEIGHT, 8);
  assert.equal(CRYSTAL_RAIL_CORE_HEIGHT, 1.25);
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
  assert.deepEqual(buildTimelineItems([], 2026), []);
});

test('年份索引和时间轴 offset 可以双向换算', () => {
  assert.equal(timelineOffsetForIndex(3, TIMELINE_ITEM_WIDTH), -3 * TIMELINE_ITEM_WIDTH);
  assert.equal(timelineIndexForOffset(-3 * TIMELINE_ITEM_WIDTH, 8, TIMELINE_ITEM_WIDTH), 3);
  assert.equal(timelineIndexForSelection(buildTimelineItems(['2022'], 2026), '2024'), 5);
  assert.equal(timelineIndexForSelection(buildTimelineItems(['2022'], 2026), null), 0);
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
