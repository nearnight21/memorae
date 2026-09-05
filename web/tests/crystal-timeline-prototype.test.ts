import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prototypeSource = readFileSync(
  new URL('../src/prototype/CrystalTimelineMapPrototypePage.tsx', import.meta.url),
  'utf8',
);

test('水晶时间轴原型提供固定年份数据以保持时间轴可见', () => {
  assert.doesNotMatch(prototypeSource, /memories=\{\[\]\}/);
  assert.match(prototypeSource, /memories=\{TIMELINE_PREVIEW_MEMORIES\}/);
  assert.match(prototypeSource, /year:\s*2007/);
  assert.match(prototypeSource, /year:\s*2026/);
});
