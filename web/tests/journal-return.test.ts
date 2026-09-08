import assert from 'node:assert/strict';
import test from 'node:test';
import { journalReturnTransform } from '../src/components/journalReturn';

const book = { x: 100, y: 50, width: 1200, height: 700 };
const viewport = { width: 1400, height: 800 };

test('手帐以书脊为中心回收到实际气泡位置，并保持缩放比例', () => {
  const result = journalReturnTransform({ x: 240, y: 180, width: 76, height: 76 }, book, viewport, false);
  assert.equal(book.x + book.width * 0.48 + result.x, 240);
  assert.equal(book.y + book.height / 2 + result.y, 180);
  assert.equal(result.scale * book.height, 76);
  assert.ok(result.scale * book.width * 0.22 <= 76);
  assert.equal(result.hasTarget, true);
});

test('窄屏以页面中心回收，尺寸不超出气泡', () => {
  const result = journalReturnTransform({ x: 150, y: 200, width: 60, height: 60 }, book, viewport, true);
  assert.equal(book.x + book.width / 2 + result.x, 150);
  assert.equal(book.y + book.height / 2 + result.y, 200);
  assert.ok(result.scale * book.width <= 60);
  assert.ok(result.scale * book.height <= 60);
});

test('缺失、视口外和无效气泡原地收起，不飞向虚构坐标', () => {
  for (const target of [
    null,
    { x: -1, y: 100, width: 76, height: 76 },
    { x: 1500, y: 100, width: 76, height: 76 },
    { x: 100, y: 900, width: 76, height: 76 },
    { x: NaN, y: 100, width: 76, height: 76 },
    { x: 100, y: 100, width: 0, height: 76 },
  ]) {
    assert.deepEqual(journalReturnTransform(target, book, viewport, false), { x: 0, y: 0, scale: 0.86, hasTarget: false });
  }
});
