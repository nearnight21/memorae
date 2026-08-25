export type GoldenFrameMode = 'reference' | 'render' | 'overlay';

export type GoldenLayerKey =
  | 'track'
  | 'ticks'
  | 'years'
  | 'body'
  | 'outerRim'
  | 'innerRim'
  | 'softHighlight'
  | 'specularHighlight'
  | 'lowerShade'
  | 'label';

export interface GoldenLayerControl {
  enabled: boolean;
  opacity: number;
}

export type GoldenLayerState = Record<GoldenLayerKey, GoldenLayerControl>;

export interface GoldenCrystalGeometry {
  width: number;
  height: number;
  leftBulge: number;
  rightBulge: number;
  topCurve: number;
  bottomCurve: number;
  shoulderTightness: number;
  verticalAsymmetry: number;
}

export interface GoldenCrystalLighting {
  softHighlightY: number;
  softHighlightBlur: number;
  specularY: number;
  lowerShadeY: number;
  lowerShadeBlur: number;
}

export interface GoldenTrackPreset {
  centerYRatio: number;
  glassHeight: number;
  lineWidth: number;
  tickHeight: number;
  tickWidth: number;
}

export interface GoldenCrystalPreset {
  referenceViewport: { width: number; height: number };
  label: string;
  geometry: GoldenCrystalGeometry;
  lighting: GoldenCrystalLighting;
  track: GoldenTrackPreset;
  yearOffsets: readonly number[];
  years: readonly string[];
  layers: GoldenLayerState;
}

export const GOLDEN_LAYER_ORDER: readonly GoldenLayerKey[] = [
  'track',
  'ticks',
  'years',
  'body',
  'outerRim',
  'innerRim',
  'softHighlight',
  'specularHighlight',
  'lowerShade',
  'label',
];

export const GOLDEN_LAYER_LABELS: Record<GoldenLayerKey, string> = {
  track: 'Track',
  ticks: 'Ticks',
  years: 'Years',
  body: 'Body',
  outerRim: 'Outer Rim',
  innerRim: 'Inner Rim',
  softHighlight: 'Soft Highlight',
  specularHighlight: 'Specular Highlight',
  lowerShade: 'Lower Shade',
  label: 'Label',
};

export const GOLDEN_CRYSTAL_PRESET: GoldenCrystalPreset = {
  referenceViewport: { width: 390, height: 844 },
  label: '2021',
  geometry: {
    width: 88,
    height: 58,
    leftBulge: 1.4,
    rightBulge: 1.8,
    topCurve: 0.14,
    bottomCurve: 0.17,
    shoulderTightness: 0.11,
    verticalAsymmetry: 1.2,
  },
  lighting: {
    softHighlightY: -17.2,
    softHighlightBlur: 0.9,
    specularY: -19.3,
    lowerShadeY: 18.5,
    lowerShadeBlur: 0.8,
  },
  track: {
    centerYRatio: 0.8615,
    glassHeight: 44,
    lineWidth: 0.78,
    tickHeight: 8.5,
    tickWidth: 0.62,
  },
  yearOffsets: [-168, -116, -64, 0, 66, 118, 170],
  years: ['2018', '2019', '2020', '2021', '2022', '2023', '2024'],
  layers: {
    track: { enabled: true, opacity: 0.72 },
    ticks: { enabled: true, opacity: 0.68 },
    years: { enabled: true, opacity: 0.72 },
    body: { enabled: true, opacity: 0.34 },
    outerRim: { enabled: true, opacity: 0.76 },
    innerRim: { enabled: true, opacity: 0.48 },
    softHighlight: { enabled: true, opacity: 0.44 },
    specularHighlight: { enabled: true, opacity: 0.7 },
    lowerShade: { enabled: true, opacity: 0.38 },
    label: { enabled: true, opacity: 0.92 },
  },
};

export function cloneGoldenLayerState(
  source: GoldenLayerState = GOLDEN_CRYSTAL_PRESET.layers,
): GoldenLayerState {
  return Object.fromEntries(GOLDEN_LAYER_ORDER.map((key) => [
    key,
    { ...source[key] },
  ])) as GoldenLayerState;
}

export function clampGoldenOpacity(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}
