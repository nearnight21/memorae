export const CRYSTAL_TIMELINE_HEIGHT = 84;
export const CRYSTAL_RAIL_CENTER_Y = 35;
export const CRYSTAL_RAIL_HEIGHT = 8;
export const CRYSTAL_RAIL_Y = CRYSTAL_RAIL_CENTER_Y - CRYSTAL_RAIL_HEIGHT / 2;
export const CRYSTAL_RAIL_CORE_HEIGHT = 1.25;
export const CRYSTAL_LENS_WIDTH = 52;
export const CRYSTAL_LENS_HEIGHT = 38;
export const CRYSTAL_LENS_RADIUS = 14;
export const CRYSTAL_LENS_VIEWPORT_WIDTH = CRYSTAL_LENS_WIDTH;
export const CRYSTAL_HOME_BOTTOM_PADDING = 48;

export function crystalRailBottomDistance(
  bottomPadding = CRYSTAL_HOME_BOTTOM_PADDING,
): number {
  return bottomPadding + CRYSTAL_TIMELINE_HEIGHT - CRYSTAL_RAIL_CENTER_Y;
}
