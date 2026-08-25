import type { GoldenCrystalGeometry } from './crystalTimelineGoldenPreset';

export interface CrystalPathParams extends GoldenCrystalGeometry {
  centerX: number;
  centerY: number;
}

function fixed(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function point(x: number, y: number): string {
  return `${fixed(x)} ${fixed(y)}`;
}

export function generateCrystalPath(params: CrystalPathParams): string {
  const {
    centerX,
    centerY,
    width,
    height,
    leftBulge,
    rightBulge,
    topCurve,
    bottomCurve,
    shoulderTightness,
    verticalAsymmetry,
  } = params;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const left = centerX - halfWidth - leftBulge;
  const right = centerX + halfWidth + rightBulge;
  const top = centerY - halfHeight;
  const bottom = centerY + halfHeight;
  const topDepth = height * topCurve;
  const bottomDepth = height * bottomCurve;
  const shoulder = Math.max(0.04, Math.min(0.22, shoulderTightness));
  const topCenterX = centerX - width * 0.025;
  const bottomCenterX = centerX + width * 0.055;

  return [
    `M ${point(topCenterX, top)}`,
    `C ${point(centerX + width * (0.22 + shoulder * 0.18), top - height * 0.008)}`,
    `${point(right - width * (0.12 + shoulder * 0.08), top + topDepth * 0.34)}`,
    `${point(right - width * 0.018, centerY - height * 0.105 + verticalAsymmetry * 0.18)}`,
    `C ${point(right + rightBulge * 0.16, centerY + height * 0.08)}`,
    `${point(right - width * (0.1 + shoulder * 0.06), bottom - bottomDepth * 0.3)}`,
    `${point(bottomCenterX, bottom + verticalAsymmetry * 0.16)}`,
    `C ${point(centerX - width * (0.23 + shoulder * 0.12), bottom + height * 0.012)}`,
    `${point(left + width * (0.095 + shoulder * 0.05), bottom - bottomDepth * 0.34)}`,
    `${point(left + width * 0.012, centerY + height * 0.065 - verticalAsymmetry * 0.12)}`,
    `C ${point(left - leftBulge * 0.14, centerY - height * 0.105)}`,
    `${point(left + width * (0.1 + shoulder * 0.05), top + topDepth * 0.32)}`,
    `${point(topCenterX, top)}`,
    'Z',
  ].join(' ');
}

export function insetCrystalGeometry(
  geometry: GoldenCrystalGeometry,
  inset: number,
): GoldenCrystalGeometry {
  return {
    ...geometry,
    width: Math.max(8, geometry.width - inset * 2),
    height: Math.max(8, geometry.height - inset * 2),
    leftBulge: Math.max(0, geometry.leftBulge - inset * 0.18),
    rightBulge: Math.max(0, geometry.rightBulge - inset * 0.18),
  };
}

export function generateSurfaceArcPath(
  centerX: number,
  centerY: number,
  width: number,
  yOffset: number,
  sag: number,
): string {
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const y = centerY + yOffset;
  return `M ${point(left, y + sag * 0.18)} C ${point(centerX - width * 0.2, y - sag)} ${point(centerX + width * 0.22, y - sag * 0.78)} ${point(right, y + sag * 0.12)}`;
}
