import assert from 'node:assert/strict';
import test from 'node:test';
import { getTimelineTicks } from '../src/lib/timelineTicks';

test('按跨度和宽度选择自适应主刻度', () => {
  assert.equal(getTimelineTicks(2018, 2025).step, 1);
  assert.equal(getTimelineTicks(2010, 2025).step, 2);
  assert.equal(getTimelineTicks(2000, 2025).step, 5);
  assert.equal(getTimelineTicks(1970, 2025).step, 10);
  assert.equal(getTimelineTicks(1900, 2025).step, 20);
});

test('窄时间轴会增加步长，但仍保留首尾年份', () => {
  const ticks = getTimelineTicks(2000, 2025, { width: 320 });
  assert.equal(ticks.step, 10);
  assert.deepEqual(ticks.majorYears, [2000, 2010, 2020, 2025]);
});

test('次刻度保持稀疏且不影响逐年范围', () => {
  const ticks = getTimelineTicks(2000, 2025);
  assert.deepEqual(ticks.majorYears, [2000, 2005, 2010, 2015, 2020, 2025]);
  assert.deepEqual(ticks.minorYears, [2001, 2002, 2003, 2004, 2006, 2007, 2008, 2009, 2011, 2012, 2013, 2014, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024]);
});
