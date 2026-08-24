import assert from 'node:assert/strict';
import test from 'node:test';

import { memoryHeroLayout, memoryHeroSize } from '../src/ui/memoryOverlayLayout';

test('详情页和编辑页共用相同的 Hero 图片尺寸规则', () => {
  assert.deepEqual(memoryHeroSize(390, 844), { width: 358, height: 422 });
  assert.deepEqual(memoryHeroSize(300, 600), { width: 268, height: 360 });
  assert.deepEqual(memoryHeroSize(900, 1200), { width: 358, height: 422 });
});

test('详情页和编辑页共用相同的 Hero 图片顶部坐标', () => {
  assert.deepEqual(memoryHeroLayout(390, 844, 24, 3), {
    width: 358,
    height: 422,
    top: 76,
  });
  assert.equal(memoryHeroLayout(390, 844, 32, 2).top, 79);
});
