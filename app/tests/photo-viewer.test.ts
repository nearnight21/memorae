import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  clampPhotoViewerScale,
  clampPhotoViewerTranslation,
  photoViewerPanBounds,
} from '../src/detail/photoViewerModel';

test('照片查看器将缩放限制在 1x 到 4x', () => {
  assert.equal(clampPhotoViewerScale(0.4), 1);
  assert.equal(clampPhotoViewerScale(2.5), 2.5);
  assert.equal(clampPhotoViewerScale(7), 4);
});

test('照片查看器只允许在放大内容仍覆盖画布的范围内移动', () => {
  assert.deepEqual(photoViewerPanBounds(390, 700, 1200, 1800, 1), { x: 0, y: 0 });
  assert.deepEqual(photoViewerPanBounds(390, 700, 1200, 1800, 2), { x: 195, y: 235 });
  assert.deepEqual(
    clampPhotoViewerTranslation({ x: 260, y: -400 }, { x: 195, y: 235 }),
    { x: 195, y: -235 },
  );
});

test('全屏查看器在同一画布内从 preview 切换到 original，并使用无回弹的原生相册式手势', () => {
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const viewerSource = readFileSync(new URL('../src/detail/PhotoViewerOverlay.tsx', import.meta.url), 'utf8');

  assert.match(appSource, /originalUri: null/);
  assert.match(appSource, /current\.photoId === photoId/);
  assert.match(appSource, /originalUri: uri/);
  assert.match(appSource, /originalUri=\{photoViewer\.originalUri\}/);
  assert.match(viewerSource, /source=\{\{ uri: previewUri \}\}/);
  assert.match(viewerSource, /source=\{\{ uri: originalUri \}\}/);
  assert.doesNotMatch(viewerSource, /\bModal\b/);
  assert.match(viewerSource, /ResumableZoom/);
  assert.match(viewerSource, /ref=\{zoomRef\}/);
  assert.doesNotMatch(viewerSource, /reference=\{zoomRef\}/);
  assert.match(viewerSource, /width: canvasSize\.width/);
  assert.match(viewerSource, /height: canvasSize\.height/);
  assert.match(viewerSource, /scaleMode="clamp"/);
  assert.match(viewerSource, /panMode="clamp"/);
  assert.match(viewerSource, /decay=\{false\}/);
  assert.match(viewerSource, /allowPinchPanning/);
  assert.match(viewerSource, /onTap=\{onTap\}/);
  assert.doesNotMatch(viewerSource, /onUpdate=\{onZoomUpdate\}/);
  assert.doesNotMatch(viewerSource, /withSpring|withDecay/);
  assert.doesNotMatch(viewerSource, /关闭照片浏览/);
});
