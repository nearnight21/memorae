export interface MemoryHeroSize {
  width: number;
  height: number;
}

export interface MemoryHeroLayout extends MemoryHeroSize {
  top: number;
}

const HERO_BASE_TOP_OFFSET = 62;
const DETAIL_LIFT_PHYSICAL_PIXELS = 30;

export function memoryHeroSize(viewportWidth: number, viewportHeight: number): MemoryHeroSize {
  return {
    width: Math.min(Math.max(viewportWidth - 32, 0), 358),
    height: Math.min(Math.max(viewportHeight * 0.5, 360), 422),
  };
}

export function memoryHeroLayout(
  viewportWidth: number,
  viewportHeight: number,
  topInset: number,
  pixelRatio: number,
): MemoryHeroLayout {
  return {
    ...memoryHeroSize(viewportWidth, viewportHeight),
    top: topInset + HERO_BASE_TOP_OFFSET - (DETAIL_LIFT_PHYSICAL_PIXELS / Math.max(pixelRatio, 1)),
  };
}
