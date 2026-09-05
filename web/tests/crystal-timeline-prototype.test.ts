import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prototypeSource = readFileSync(
  new URL('../src/prototype/CrystalTimelineMapPrototypePage.tsx', import.meta.url),
  'utf8',
);
const timelineSource = readFileSync(
  new URL('../src/components/CrystalTimeline.tsx', import.meta.url),
  'utf8',
);
const mapSource = readFileSync(
  new URL('../src/components/MapView.tsx', import.meta.url),
  'utf8',
);

test('水晶时间轴原型提供固定年份数据以保持时间轴可见', () => {
  assert.doesNotMatch(prototypeSource, /memories=\{\[\]\}/);
  assert.match(prototypeSource, /memories=\{TIMELINE_PREVIEW_MEMORIES\}/);
  assert.match(prototypeSource, /year:\s*2007/);
  assert.match(prototypeSource, /year:\s*2026/);
});

test('时间轴新建按钮复用地图的新建记忆入口', () => {
  assert.match(timelineSource, /onAddMemory\?: \(\) => void/);
  assert.match(timelineSource, /className="crystal-formal-edge crystal-formal-edge-plus"/);
  assert.match(timelineSource, /aria-label="新建记忆"/);
  assert.match(timelineSource, /onAddMemory\?\.\(\)/);
  assert.match(mapSource, /<CrystalTimeline[\s\S]*onAddMemory=\{onAddMemory/);
  assert.match(mapSource, /onAddMemory && allYears\.length === 0/);
});
