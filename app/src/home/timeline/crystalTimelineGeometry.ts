import { GOLDEN_CRYSTAL_PRESET } from './goldenCrystalPreset';

export const CRYSTAL_TIMELINE_HEIGHT = 84;
export const CRYSTAL_RAIL_CENTER_Y = 35;
export const CRYSTAL_RAIL_HEIGHT = GOLDEN_CRYSTAL_PRESET.track.glassHeight;
export const CRYSTAL_RAIL_Y = CRYSTAL_RAIL_CENTER_Y - CRYSTAL_RAIL_HEIGHT / 2;
export const CRYSTAL_RAIL_CORE_HEIGHT = GOLDEN_CRYSTAL_PRESET.track.lineWidth;
export const CRYSTAL_LENS_WIDTH = GOLDEN_CRYSTAL_PRESET.geometry.width;
export const CRYSTAL_LENS_HEIGHT = GOLDEN_CRYSTAL_PRESET.geometry.height;
export const CRYSTAL_LENS_VIEWPORT_WIDTH = CRYSTAL_LENS_WIDTH;
export const CRYSTAL_HOME_BOTTOM_PADDING = 48;

export function crystalRailBottomDistance(
  bottomPadding = CRYSTAL_HOME_BOTTOM_PADDING,
): number {
  return bottomPadding + CRYSTAL_TIMELINE_HEIGHT - CRYSTAL_RAIL_CENTER_Y;
}
