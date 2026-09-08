import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('详情页具备实体手账折页展开与对折吸附收起动效', () => {
  const source = readFileSync(
    new URL('../src/detail/MemoryDetailOverlay.tsx', import.meta.url),
    'utf8',
  );

  // 展开动画契约：手账画卷微缩放升起与相纸微旋
  assert.match(source, /openProgress/);
  assert.match(source, /openScale/);
  assert.match(source, /rotateA/);
  assert.match(source, /rotateB/);

  // 对折收起契约：Folio Fold 缩小后退与吸入地图气泡
  assert.match(source, /dismissProgress/);
  assert.match(source, /dismissScale/);
  assert.match(source, /dismissOpacity/);
  assert.match(source, /cardScale/);

  // 蒙层平滑过渡与提前归零（避免最后一刻闪烁）
  assert.match(source, /backdropFactor/);
  assert.match(source, /mapDimOpacity/);

  // 支持点击空白背景合上手帐
  assert.match(source, /accessibilityLabel="合上手帐返回地图"/);
});

