import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Shader Prototype 以参数化高度场生成静态晶体光学层', async () => {
  const source = await readFile(
    new URL('../src/testing/CrystalThumbShaderPrototype.tsx', import.meta.url),
    'utf8',
  );

  for (const uniform of [
    'uCenter',
    'uSize',
    'uShoulder',
    'uTopFlatten',
    'uBottomFlatten',
    'uSurfaceHeight',
    'uLightX',
    'uLightY',
    'uSpecularPower',
    'uSpecularStrength',
    'uFresnelPower',
    'uFresnelStrength',
    'uTransmission',
    'uWarmTint',
    'uAbsorption',
    'uVolumeStrength',
    'uCausticStrength',
    'uDebugMode',
  ]) {
    assert.match(source, new RegExp(`uniform float(?:2)? ${uniform};`));
  }

  assert.match(source, /float shapeBoundary\(float2 xy\)/);
  assert.match(source, /float heightAt\(float2 xy\)/);
  assert.match(source, /float plateauWithSteepRim = 1\.0 - pow\(radialField, bevelPower\)/);
  assert.doesNotMatch(source, /pow\(boundary, 0\.48\)/);
  assert.match(source, /float3 surfaceNormal\(float2 xy\)/);
  assert.match(source, /heightAt\(xy \+ float2\(epsilon, 0\.0\)\)/);
  assert.match(source, /heightAt\(xy - float2\(0\.0, epsilon\)\)/);
  assert.match(source, /fresnelBase/);
  assert.match(source, /halfDirection/);
  assert.match(source, /absorption/);
  assert.match(source, /caustic/);
  assert.match(source, /Skia\.RuntimeEffect\.Make/);
  assert.match(source, /warmTint: 0/);
  assert.match(source, /volumeStrength: 0/);
  assert.match(source, /causticStrength: 0/);
  assert.doesNotMatch(source, /baseAlpha/);
  assert.match(source, /<Rect/);
  assert.match(source, /<Shader/);
  assert.doesNotMatch(
    source,
    /useSharedValue|useClock|useDerivedValue|withSpring|withTiming|Gesture\.|MapView|ImageShader|makeImageSnapshot/,
  );
});

test('Golden Frame 保留 Legacy 并提供 Shader 调试视图和受限参数组', async () => {
  const [screen, renderer, prototype, formalTimeline, formalCanvas] = await Promise.all([
    readFile(new URL('../src/testing/CrystalTimelineGoldenFrameScreen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/testing/CrystalTimelineGoldenRenderer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/testing/CrystalThumbShaderPrototype.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/home/timeline/ArcTimeline.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/archive/crystal-timeline/CrystalRailCanvas.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(screen, /legacy: 'Legacy'/);
  assert.match(screen, /shaderPrototype: 'Shader Prototype'/);
  assert.match(screen, /useState<GoldenFrameMode>\('render'\)/);
  assert.match(screen, /useState<GoldenCrystalRendererKind>\('shaderPrototype'\)/);
  for (const label of [
    'Final',
    'Shape Mask',
    'Height Field',
    'Normal',
    'Fresnel',
    'Specular',
    'Thickness / Volume',
  ]) {
    assert.match(prototype, new RegExp(label.replace('/', '\\/')));
  }
  assert.match(screen, /Overlay 只用于几何与对齐/);
  assert.match(screen, />Material Lock</);
  assert.match(screen, /Body whitening \/ warm tint \/ volume \/ caustic 已锁定关闭/);

  assert.match(renderer, /renderer === 'legacy'/);
  assert.match(renderer, /GoldenCrystalTrackLayers/);
  assert.match(renderer, /GoldenCrystalMaterialLayers/);
  assert.match(renderer, /CrystalThumbShaderPrototype/);
  assert.doesNotMatch(formalTimeline, /CrystalThumbShaderPrototype/);
  assert.doesNotMatch(formalCanvas, /CrystalThumbShaderPrototype/);
});
