import type { GoldenCrystalGeometry } from './goldenCrystalPreset';

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

interface CrystalPoint {
  x: number;
  y: number;
}

function closedBezierPath(points: readonly CrystalPoint[], tension: number): string {
  const commands = [`M ${point(points[0].x, points[0].y)}`];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const afterNext = points[(index + 2) % points.length];
    const control1 = {
      x: current.x + (next.x - previous.x) * tension / 6,
      y: current.y + (next.y - previous.y) * tension / 6,
    };
    const control2 = {
      x: next.x - (afterNext.x - current.x) * tension / 6,
      y: next.y - (afterNext.y - current.y) * tension / 6,
    };
    commands.push(
      `C ${point(control1.x, control1.y)} ${point(control2.x, control2.y)} ${point(next.x, next.y)}`,
    );
  }
  commands.push('Z');
  return commands.join(' ');
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
  const shoulder = Math.max(0.08, Math.min(0.24, shoulderTightness));
  const topSpan = width * (0.28 + topCurve * 0.08);
  const bottomSpan = width * (0.28 + bottomCurve * 0.08);
  const rightShoulderInset = width * shoulder * 0.45;
  const leftShoulderInset = width * shoulder * 0.48;
  const points: readonly CrystalPoint[] = [
    { x: centerX - topSpan, y: top + verticalAsymmetry * 0.08 },
    { x: centerX + topSpan * 0.96, y: top - verticalAsymmetry * 0.06 },
    {
      x: right - rightShoulderInset,
      y: centerY - height * (0.24 + topCurve * 0.1),
    },
    { x: right, y: centerY - height * 0.018 + verticalAsymmetry * 0.04 },
    {
      x: right - rightShoulderInset * 1.08,
      y: centerY + height * (0.235 + bottomCurve * 0.1),
    },
    { x: centerX + bottomSpan, y: bottom + verticalAsymmetry * 0.08 },
    { x: centerX - bottomSpan * 0.96, y: bottom - verticalAsymmetry * 0.03 },
    {
      x: left + leftShoulderInset * 1.05,
      y: centerY + height * (0.24 + bottomCurve * 0.09),
    },
    { x: left, y: centerY + height * 0.01 - verticalAsymmetry * 0.04 },
    {
      x: left + leftShoulderInset,
      y: centerY - height * (0.235 + topCurve * 0.1),
    },
  ];

  return closedBezierPath(points, 0.86);
}

export function generateInnerRimPath(params: CrystalPathParams): string {
  const { centerX, centerY, width, height, verticalAsymmetry } = params;
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const top = centerY - height / 2;
  const bottom = centerY + height / 2;

  return [
    `M ${point(left + width * 0.1, centerY - height * 0.08)}`,
    `C ${point(left + width * 0.11, top + height * 0.18)}`,
    `${point(centerX - width * 0.25, top + height * 0.105)}`,
    `${point(centerX - width * 0.03, top + height * 0.115 - verticalAsymmetry * 0.04)}`,
    `C ${point(centerX + width * 0.19, top + height * 0.1)}`,
    `${point(right - width * 0.12, top + height * 0.2)}`,
    `${point(right - width * 0.08, centerY - height * 0.03)}`,
    `C ${point(right - width * 0.06, centerY + height * 0.14)}`,
    `${point(centerX + width * 0.28, bottom - height * 0.1)}`,
    `${point(centerX + width * 0.05, bottom - height * 0.095 + verticalAsymmetry * 0.03)}`,
  ].join(' ');
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
