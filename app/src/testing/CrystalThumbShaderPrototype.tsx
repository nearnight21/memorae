import React, { useMemo } from 'react';
import {
  Rect,
  Shader,
  Skia,
} from '@shopify/react-native-skia';

// THROWAWAY PROTOTYPE: can a static parameterized height field read as thicker crystal than Legacy?
export const CRYSTAL_SHADER_DEBUG_MODES = [
  'final',
  'shapeMask',
  'heightField',
  'normal',
  'fresnel',
  'specular',
  'thicknessVolume',
] as const;

export type CrystalShaderDebugMode = (typeof CRYSTAL_SHADER_DEBUG_MODES)[number];

export const CRYSTAL_SHADER_DEBUG_LABELS: Record<CrystalShaderDebugMode, string> = {
  final: 'Final',
  shapeMask: 'Shape Mask',
  heightField: 'Height Field',
  normal: 'Normal',
  fresnel: 'Fresnel',
  specular: 'Specular',
  thicknessVolume: 'Thickness / Volume',
};

export interface CrystalThumbShaderParameters {
  width: number;
  height: number;
  shoulder: number;
  topFlatten: number;
  bottomFlatten: number;
  leftBulge: number;
  rightBulge: number;
  asymmetry: number;
  surfaceHeight: number;
  lightX: number;
  lightY: number;
  specularPower: number;
  specularStrength: number;
  fresnelPower: number;
  fresnelStrength: number;
  transmission: number;
  warmTint: number;
  absorption: number;
  volumeStrength: number;
  causticStrength: number;
}

export const DEFAULT_CRYSTAL_THUMB_SHADER_PARAMETERS: CrystalThumbShaderParameters = {
  width: 88,
  height: 58,
  shoulder: 0.13,
  topFlatten: 0.66,
  bottomFlatten: 0.42,
  leftBulge: 0.035,
  rightBulge: 0.055,
  asymmetry: 0.018,
  surfaceHeight: 1.25,
  lightX: -0.52,
  lightY: -0.68,
  specularPower: 72,
  specularStrength: 1.45,
  fresnelPower: 2.55,
  fresnelStrength: 1.18,
  transmission: 1,
  warmTint: 0,
  absorption: 0.18,
  volumeStrength: 0,
  causticStrength: 0,
};

export function cloneCrystalThumbShaderParameters(): CrystalThumbShaderParameters {
  return { ...DEFAULT_CRYSTAL_THUMB_SHADER_PARAMETERS };
}

export const CRYSTAL_THUMB_SHADER_SOURCE = `
uniform float2 uCenter;
uniform float2 uSize;
uniform float uShoulder;
uniform float uTopFlatten;
uniform float uBottomFlatten;
uniform float uLeftBulge;
uniform float uRightBulge;
uniform float uAsymmetry;
uniform float uSurfaceHeight;
uniform float uLightX;
uniform float uLightY;
uniform float uSpecularPower;
uniform float uSpecularStrength;
uniform float uFresnelPower;
uniform float uFresnelStrength;
uniform float uTransmission;
uniform float uWarmTint;
uniform float uAbsorption;
uniform float uVolumeStrength;
uniform float uCausticStrength;
uniform float uDebugMode;

float sat(float value) {
  return clamp(value, 0.0, 1.0);
}

float2 crystalPoint(float2 xy) {
  float2 p = (xy - uCenter) / (uSize * 0.5);
  p.x += uAsymmetry * p.y;
  p.y -= uAsymmetry * 0.35;
  return p;
}

float shapeBoundary(float2 xy) {
  float2 p = crystalPoint(xy);
  float vertical = abs(p.y);
  float sideBulge = p.x < 0.0 ? uLeftBulge : uRightBulge;
  float centralBulge = 1.0 + sideBulge * sat(1.0 - p.y * p.y);
  float shoulder = max(0.68, 1.0 - uShoulder * pow(vertical, 1.35));
  float normalizedX = abs(p.x) / (centralBulge * shoulder);
  float flatten = p.y < 0.0 ? uTopFlatten : uBottomFlatten;
  float verticalPower = mix(2.15, 5.2, sat(flatten));
  float horizontalPower = mix(2.35, 3.25, sat(uShoulder * 2.4));
  float field = pow(normalizedX, horizontalPower) + pow(vertical, verticalPower);
  return 1.0 - field;
}

float heightAt(float2 xy) {
  float boundary = shapeBoundary(xy);
  float radialField = sat(1.0 - boundary);
  float bevelPower = 3.6;
  float plateauWithSteepRim = 1.0 - pow(radialField, bevelPower);
  return max(plateauWithSteepRim, 0.0) * uSurfaceHeight;
}

float3 surfaceNormal(float2 xy) {
  float epsilon = 0.72;
  float dx = heightAt(xy + float2(epsilon, 0.0))
    - heightAt(xy - float2(epsilon, 0.0));
  float dy = heightAt(xy + float2(0.0, epsilon))
    - heightAt(xy - float2(0.0, epsilon));
  float gradientStrength = 25.0 / (epsilon * 2.0);
  return normalize(float3(-dx * gradientStrength, -dy * gradientStrength, 1.0));
}

half4 debugOutput(float3 color, float mask) {
  return half4(color * mask, mask);
}

half4 main(float2 xy) {
  float boundary = shapeBoundary(xy);
  float antialias = 2.0 / min(uSize.x, uSize.y);
  float mask = smoothstep(-antialias, antialias, boundary);
  float height = heightAt(xy);
  float normalizedHeight = sat(height / max(uSurfaceHeight, 0.001));
  float3 normal = surfaceNormal(xy);
  float2 p = crystalPoint(xy);

  float fresnelBase = sat(1.0 - normal.z);
  float fresnel = pow(fresnelBase, max(uFresnelPower, 0.1)) * uFresnelStrength;

  float3 lightDirection = normalize(float3(uLightX, uLightY, 1.15));
  float3 viewDirection = float3(0.0, 0.0, 1.0);
  float3 halfDirection = normalize(lightDirection + viewDirection);
  float specular = pow(sat(dot(normal, halfDirection)), max(uSpecularPower, 1.0))
    * uSpecularStrength;

  float lowerFacing = smoothstep(0.05, 0.72, normal.y);
  float lowerRegion = smoothstep(-0.02, 0.9, p.y);
  float absorption = lowerFacing * lowerRegion * (0.35 + fresnelBase * 0.65)
    * uAbsorption;

  float volume = normalizedHeight * uVolumeStrength;
  float causticBand = pow(sat(1.0 - abs(p.x * 0.92 + p.y * 0.18)), 12.0);
  float causticRegion = pow(sat(1.0 - abs(p.y - 0.34)), 7.0);
  float caustic = causticBand * causticRegion * normalizedHeight * uCausticStrength;

  if (uDebugMode < 0.5) {
    float fresnelSignal = sat(fresnel * 0.92 * uTransmission);
    float specularSignal = sat(specular * 0.78 * uTransmission);
    float absorptionSignal = sat(absorption * 0.08);
    float signal = fresnelSignal + specularSignal + absorptionSignal;
    float alpha = mask * sat(signal);
    float3 absorptionColor = mix(
      float3(0.48, 0.37, 0.28),
      float3(0.52, 0.27, 0.09),
      sat(uWarmTint)
    );
    float3 premultipliedSignal =
      float3(0.98, 0.99, 1.0) * fresnelSignal
      + float3(1.0, 1.0, 0.995) * specularSignal
      + absorptionColor * absorptionSignal;
    float3 color = premultipliedSignal / max(signal, 0.001);
    return half4(color * alpha, alpha);
  }

  if (uDebugMode < 1.5) {
    return debugOutput(float3(0.96, 0.93, 0.86), mask);
  }
  if (uDebugMode < 2.5) {
    return debugOutput(float3(normalizedHeight), mask);
  }
  if (uDebugMode < 3.5) {
    return debugOutput(normal * 0.5 + 0.5, mask);
  }
  if (uDebugMode < 4.5) {
    return debugOutput(float3(fresnel), mask);
  }
  if (uDebugMode < 5.5) {
    return debugOutput(float3(specular), mask);
  }
  return debugOutput(
    mix(float3(normalizedHeight), float3(0.86, 0.48, 0.18), sat(volume + caustic)),
    mask
  );
}
`;

export const CRYSTAL_THUMB_RUNTIME_EFFECT = Skia.RuntimeEffect.Make(
  CRYSTAL_THUMB_SHADER_SOURCE,
);

interface Props {
  centerX: number;
  centerY: number;
  scale: number;
  parameters: CrystalThumbShaderParameters;
  debugMode: CrystalShaderDebugMode;
}

export function CrystalThumbShaderPrototype({
  centerX,
  centerY,
  scale,
  parameters,
  debugMode,
}: Props) {
  const width = parameters.width * scale;
  const height = parameters.height * scale;
  const padding = 7 * scale;
  const uniforms = useMemo(() => ({
    uCenter: [centerX, centerY],
    uSize: [width, height],
    uShoulder: parameters.shoulder,
    uTopFlatten: parameters.topFlatten,
    uBottomFlatten: parameters.bottomFlatten,
    uLeftBulge: parameters.leftBulge,
    uRightBulge: parameters.rightBulge,
    uAsymmetry: parameters.asymmetry,
    uSurfaceHeight: parameters.surfaceHeight,
    uLightX: parameters.lightX,
    uLightY: parameters.lightY,
    uSpecularPower: parameters.specularPower,
    uSpecularStrength: parameters.specularStrength,
    uFresnelPower: parameters.fresnelPower,
    uFresnelStrength: parameters.fresnelStrength,
    uTransmission: parameters.transmission,
    uWarmTint: parameters.warmTint,
    uAbsorption: parameters.absorption,
    uVolumeStrength: parameters.volumeStrength,
    uCausticStrength: parameters.causticStrength,
    uDebugMode: CRYSTAL_SHADER_DEBUG_MODES.indexOf(debugMode),
  }), [centerX, centerY, debugMode, height, parameters, width]);

  if (!CRYSTAL_THUMB_RUNTIME_EFFECT) return null;

  return (
    <Rect
      x={centerX - width / 2 - padding}
      y={centerY - height / 2 - padding}
      width={width + padding * 2}
      height={height + padding * 2}
    >
      <Shader source={CRYSTAL_THUMB_RUNTIME_EFFECT} uniforms={uniforms} />
    </Rect>
  );
}

export default CrystalThumbShaderPrototype;
