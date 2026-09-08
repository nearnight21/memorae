import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('AuthEntryScreen 摒弃低清拉伸切图，使用 Skia 矢量时光轴与真实拍立得纸感', () => {
  const source = readFileSync(new URL('../src/auth/AuthEntryScreen.tsx', import.meta.url), 'utf8');

  // 不再依赖 Figma 临时截屏切图
  assert.doesNotMatch(source, /figma-time-path\.png/);
  assert.doesNotMatch(source, /figma-memory-photo\.png/);

  // 使用高质感真实拍立得照片和 Skia 矢量时光曲线
  assert.match(source, /travel-photo\.png/);
  assert.match(source, /@shopify\/react-native-skia/);
  assert.match(source, /curvePath/);
  assert.match(source, /RadialGradient/);

  // 年份节点对齐
  assert.match(source, /2007/);
  assert.match(source, /2018/);
  assert.match(source, /2026/);
});

test('AuthEntryScreen 保持四个阶段的契约与无障碍支持', () => {
  const source = readFileSync(new URL('../src/auth/AuthEntryScreen.tsx', import.meta.url), 'utf8');

  // 四个阶段
  assert.match(source, /phase === 'booting'/);
  assert.match(source, /phase === 'account'/);
  assert.match(source, /phase === 'locked'/);
  assert.match(source, /建立私密空间/);

  // 关键无障碍标签与按钮角色
  assert.match(source, /accessibilityLabel=\{visible \? '隐藏密码' : '显示密码'\}/);
  assert.match(source, /accessibilityRole="button"/);

  // 密码输入框支持焦点态高亮
  assert.match(source, /fieldFocused/);
  assert.match(source, /onFocus=\{/);
  assert.match(source, /onBlur=\{/);

  // 触觉反馈
  assert.match(source, /Haptics\.impactAsync/);
});
