import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRYSTAL_TIMELINE_MAX_DATE,
  CRYSTAL_TIMELINE_MIN_DATE,
  dateToTimelineProgress,
  formatTimelineDate,
  timelineProgressToDate,
  timelineYearProgress,
} from '../src/prototype/crystalTimelineTime';

test('水晶时间轴的连续位置可以映射到完整日期范围', () => {
  assert.equal(timelineProgressToDate(0).toISOString(), CRYSTAL_TIMELINE_MIN_DATE.toISOString());
  assert.equal(timelineProgressToDate(1).toISOString(), CRYSTAL_TIMELINE_MAX_DATE.toISOString());
  assert.equal(formatTimelineDate(timelineProgressToDate(0.5)), '2023年7月3日');
});

test('日期与拖动位置可以往返换算', () => {
  const date = new Date(Date.UTC(2024, 5, 18));
  const restored = timelineProgressToDate(dateToTimelineProgress(date));
  assert.equal(restored.toISOString(), date.toISOString());
});

test('年份刻度按实际日期范围分布而非作为按钮索引', () => {
  assert.equal(timelineYearProgress(2021), 0);
  assert.ok(timelineYearProgress(2024) > 0.59);
  assert.ok(timelineYearProgress(2024) < 0.61);
  assert.ok(timelineYearProgress(2025) > timelineYearProgress(2024));
});
