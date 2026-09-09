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

test('AuthEntryScreen 登录页主按钮为登录，下方为无边框纯文字本地模式，且说明在点击后展示并支持返回', () => {
  const source = readFileSync(new URL('../src/auth/AuthEntryScreen.tsx', import.meta.url), 'utf8');

  // 主按钮文案为“登录”
  assert.match(source, /<PrimaryButton label="登录"/);

  // 本地模式为纯文字入口，无独立按钮边框
  assert.match(source, /accessibilityLabel="本地模式"/);
  assert.match(source, /style=\{styles\.textLinkButton\}/);
  assert.match(source, /<Text style=\{styles\.textLinkButtonText\}>本地模式<\/Text>/);

  // 本地模式说明在点击后展示，包含进入与返回登录入口
  assert.match(source, /本地模式说明/);
  assert.match(source, /记忆、照片、标题和地点内容只保存在这台设备，不登录、不同步。/);
  assert.match(source, /地图搜索、反向地点和照片地点识别会联网并产生服务费用，内测\/公测期间由 Memorae 承担。/);
  assert.match(source, /<PrimaryButton label="进入本地模式"/);
  assert.match(source, /accessibilityLabel="返回登录"/);
  assert.match(source, /<Text style=\{styles\.textLinkButtonText\}>返回登录<\/Text>/);

  // 完整模式亦支持查看说明与返回
  assert.match(source, /完整模式说明/);
  assert.match(source, /端到端加密与多端密文同步/);
});
