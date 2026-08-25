export type GoldenFrameMode = 'reference' | 'render' | 'overlay';

export type GoldenLayerKey =
  | 'track'
  | 'ticks'
  | 'years'
  | 'body'
  | 'volume'
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

export interface GoldenTypographyPreset {
  labelFontSize: number;
  labelLineHeight: number;
  labelColor: string;
  labelFontWeight: '400';
}

export interface GoldenCrystalPreset {
  referenceViewport: { width: number; height: number };
  label: string;
  geometry: GoldenCrystalGeometry;
  lighting: GoldenCrystalLighting;
  track: GoldenTrackPreset;
  typography: GoldenTypographyPreset;
  yearOffsets: readonly number[];
  years: readonly string[];
  layers: GoldenLayerState;
}

export const GOLDEN_LAYER_ORDER: readonly GoldenLayerKey[] = [
  'track',
  'ticks',
  'years',
  'body',
  'volume',
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
  volume: 'Volume',
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
    width: 90,
    height: 52,
    leftBulge: 1.1,
    rightBulge: 1.6,
    topCurve: 0.11,
    bottomCurve: 0.15,
    shoulderTightness: 0.16,
    verticalAsymmetry: 1.4,
  },
  lighting: {
    softHighlightY: -15.2,
    softHighlightBlur: 1.1,
    specularY: -18.1,
    lowerShadeY: 16.2,
    lowerShadeBlur: 0.7,
  },
  track: {
    centerYRatio: 0.8615,
    glassHeight: 44,
    lineWidth: 0.78,
    tickHeight: 8.5,
    tickWidth: 0.62,
  },
  typography: {
    labelFontSize: 12,
    labelLineHeight: 18,
    labelColor: '#5a4030',
    labelFontWeight: '400',
  },
  yearOffsets: [-168, -116, -64, 0, 66, 118, 170],
  years: ['2018', '2019', '2020', '2021', '2022', '2023', '2024'],
  layers: {
    track: { enabled: true, opacity: 0.82 },
    ticks: { enabled: true, opacity: 0.68 },
    years: { enabled: true, opacity: 0.72 },
    body: { enabled: true, opacity: 0.2 },
    volume: { enabled: true, opacity: 0.42 },
    outerRim: { enabled: true, opacity: 0.7 },
    innerRim: { enabled: true, opacity: 0.36 },
    softHighlight: { enabled: true, opacity: 0.32 },
    specularHighlight: { enabled: true, opacity: 0.58 },
    lowerShade: { enabled: true, opacity: 0.24 },
    label: { enabled: true, opacity: 0.82 },
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
