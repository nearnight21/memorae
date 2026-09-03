export const ARC_TIMELINE_PIXELS_PER_YEAR = 76;
export const ARC_TIMELINE_VELOCITY_PROJECTION_SECONDS = 0.12;
export const ARC_TIMELINE_EDGE_SCROLL_PIXELS_PER_SECOND = ARC_TIMELINE_PIXELS_PER_YEAR;
export const ARC_TIMELINE_MAX_LENS_DRAG_YEARS = 1.15;

export function clampArcTimelineIndex(index: number, itemCount: number): number {
  'worklet';
  if (itemCount <= 0) return 0;
  return Math.max(0, Math.min(itemCount - 1, index));
}

export function wrapArcTimelineIndex(index: number, itemCount: number): number {
  'worklet';
  if (itemCount <= 0) return 0;
  const wrapped = index % itemCount;
  return wrapped < 0 ? wrapped + itemCount : wrapped;
}

export function nearestCyclicArcTimelineIndex(
  targetIndex: number,
  aroundIndex: number,
  itemCount: number,
): number {
  'worklet';
  if (itemCount <= 0) return 0;
  const wrappedTarget = wrapArcTimelineIndex(targetIndex, itemCount);
  const turns = Math.round((aroundIndex - wrappedTarget) / itemCount);
  return wrappedTarget + turns * itemCount;
}

export function arcTimelineIndexFromDrag(
  startIndex: number,
  translationX: number,
  pixelsPerYear = 76,
): number {
  'worklet';
  return startIndex + translationX / pixelsPerYear;
}

export function visualArcTimelineDragOffset(
  dragOffsetYears: number,
  maximumDragYears = 1.15,
): number {
  'worklet';
  return Math.max(-maximumDragYears, Math.min(maximumDragYears, dragOffsetYears));
}

export function projectedArcTimelineIndex(
  currentIndex: number,
  velocityX: number,
  itemCount: number,
  pixelsPerYear = 76,
  projectionSeconds = 0.12,
): number {
  'worklet';
  if (itemCount <= 0) return 0;
  return Math.round(currentIndex + velocityX * projectionSeconds / pixelsPerYear);
}
