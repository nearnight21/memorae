export const TIMELINE_ITEM_WIDTH = 82;
export const TIMELINE_MIN_NATURAL_YEARS = 7;
export const TIMELINE_VELOCITY_PROJECTION_SECONDS = 0.12;
export const TIMELINE_EDGE_RESISTANCE = 0.28;

export interface TimelineItem {
  key: string;
  label: string;
  value: string | null;
}

export function filterMemoriesByTimelineYear<T extends { date: string }>(
  memories: readonly T[],
  selectedYear: string | null,
): T[] {
  if (selectedYear === null) return [...memories];
  const year = validYear(selectedYear);
  if (year === null) return [...memories];
  return memories.filter((memory) => {
    const memoryYear = validYear(memory.date.slice(0, 4));
    return memoryYear !== null && memoryYear <= year;
  });
}

function validYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 1 && year <= 9999 ? year : null;
}

export function buildTimelineItems(
  memoryYears: readonly string[],
  currentYear = new Date().getFullYear(),
  minimumNaturalYears = TIMELINE_MIN_NATURAL_YEARS,
): TimelineItem[] {
  const years = memoryYears
    .map(validYear)
    .filter((year): year is number => year !== null && year <= currentYear);

  const earliestMemoryYear = years.length > 0 ? Math.min(...years) : currentYear;
  const minimumWindowStart = currentYear - Math.max(1, minimumNaturalYears) + 1;
  const startYear = Math.min(earliestMemoryYear, minimumWindowStart);
  const naturalYears = Array.from(
    { length: currentYear - startYear + 1 },
    (_, index) => String(startYear + index),
  );

  return [
    { key: 'all', label: '全部', value: null },
    ...naturalYears.map((year) => ({ key: `year:${year}`, label: year, value: year })),
  ];
}

export function clampTimelineIndex(index: number, itemCount: number): number {
  'worklet';
  if (itemCount <= 0) return 0;
  return Math.max(0, Math.min(itemCount - 1, Math.round(index)));
}

export function timelineIndexForSelection(
  items: readonly TimelineItem[],
  selectedYear: string | null,
): number {
  const index = items.findIndex((item) => item.value === selectedYear);
  return index >= 0 ? index : 0;
}

export function timelineOffsetForIndex(
  index: number,
  itemWidth: number,
): number {
  'worklet';
  return -Math.max(0, index) * itemWidth;
}

export function timelineIndexForOffset(
  offset: number,
  itemCount: number,
  itemWidth: number,
): number {
  return clampTimelineIndex(-offset / itemWidth, itemCount);
}

export function projectedTimelineIndex(
  offset: number,
  velocityX: number,
  itemCount: number,
  itemWidth: number,
  projectionSeconds: number,
): number {
  'worklet';
  const projectedOffset = offset + velocityX * projectionSeconds;
  if (itemCount <= 0) return 0;
  return Math.max(0, Math.min(itemCount - 1, Math.round(-projectedOffset / itemWidth)));
}

export function resistedTimelineOffset(
  offset: number,
  itemCount: number,
  itemWidth: number,
  resistance: number,
): number {
  'worklet';
  const maximumOffset = 0;
  const minimumOffset = -Math.max(0, itemCount - 1) * itemWidth;
  if (offset > maximumOffset) return maximumOffset + (offset - maximumOffset) * resistance;
  if (offset < minimumOffset) return minimumOffset + (offset - minimumOffset) * resistance;
  return offset;
}

export function commitTimelineSelection(
  currentValue: string | null,
  nextValue: string | null,
  commit: (value: string | null) => void,
): boolean {
  if (currentValue === nextValue) return false;
  commit(nextValue);
  return true;
}

export function timelineVisualOffsetAroundLens(
  logicalOffset: number,
  itemWidth: number,
  leftNeighborOffset: number,
  rightNeighborOffset: number,
  outerStep: number,
): number {
  'worklet';
  if (logicalOffset <= -itemWidth) {
    return leftNeighborOffset
      + (logicalOffset + itemWidth) * (outerStep / itemWidth);
  }
  if (logicalOffset < 0) {
    return logicalOffset * (Math.abs(leftNeighborOffset) / itemWidth);
  }
  if (logicalOffset < itemWidth) {
    return logicalOffset * (rightNeighborOffset / itemWidth);
  }
  return rightNeighborOffset
    + (logicalOffset - itemWidth) * (outerStep / itemWidth);
}

export function timelineLogicalOffsetFromVisual(
  visualOffset: number,
  itemWidth: number,
  leftNeighborOffset: number,
  rightNeighborOffset: number,
  outerStep: number,
): number {
  'worklet';
  if (visualOffset <= leftNeighborOffset) {
    return -itemWidth
      + (visualOffset - leftNeighborOffset) * (itemWidth / outerStep);
  }
  if (visualOffset < 0) {
    return visualOffset * (itemWidth / Math.abs(leftNeighborOffset));
  }
  if (visualOffset < rightNeighborOffset) {
    return visualOffset * (itemWidth / rightNeighborOffset);
  }
  return itemWidth
    + (visualOffset - rightNeighborOffset) * (itemWidth / outerStep);
}

export const ARC_TIMELINE_PIXELS_PER_YEAR = 76;
export const ARC_TIMELINE_GESTURE_SPEED = 3;
export const ARC_TIMELINE_VELOCITY_PROJECTION_SECONDS = 0.12;
export const ARC_TIMELINE_EDGE_SCROLL_PIXELS_PER_SECOND = ARC_TIMELINE_PIXELS_PER_YEAR;
export const ARC_TIMELINE_MAX_LENS_DRAG_YEARS = 1.15;
export const ARC_TIMELINE_EDGE_STOP_YEARS = 0.85;
export const ARC_TIMELINE_EDGE_INSET_PX = 50;
export const ARC_TIMELINE_GESTURE_PENDING = 0;
export const ARC_TIMELINE_GESTURE_HORIZONTAL = 1;
export const ARC_TIMELINE_GESTURE_CREATE = 2;
export const ARC_TIMELINE_GESTURE_RESET_MAP = 3;
export const CREATE_PULL_INTENT_THRESHOLD = 10;
export const CREATE_PULL_ACTIVATION_DISTANCE = 112;
export const CREATE_PULL_MAX_DISTANCE = 164;
export const CREATE_PULL_RESISTANCE = 0.32;
export const CREATE_OVERLAY_MAX_OPACITY = 0.5;
export const RESET_PULL_INTENT_THRESHOLD = 10;
export const RESET_PULL_ACTIVATION_DISTANCE = 60;
export const RESET_PULL_MAX_DISTANCE = 112;
export const RESET_PULL_RESISTANCE = 0.28;
export const RESET_OVERLAY_MAX_OPACITY = 0.24;

export type ArcTimelineGestureMode =
  | typeof ARC_TIMELINE_GESTURE_PENDING
  | typeof ARC_TIMELINE_GESTURE_HORIZONTAL
  | typeof ARC_TIMELINE_GESTURE_CREATE
  | typeof ARC_TIMELINE_GESTURE_RESET_MAP;

export function resolveArcTimelineGestureMode(
  currentMode: ArcTimelineGestureMode,
  translationX: number,
  translationY: number,
  intentThreshold = 10,
  dominanceRatio = 1.2,
): ArcTimelineGestureMode {
  'worklet';
  if (currentMode !== ARC_TIMELINE_GESTURE_PENDING) return currentMode;
  const horizontalDistance = Math.abs(translationX);
  const verticalDistance = Math.abs(translationY);
  if (Math.max(horizontalDistance, verticalDistance) < intentThreshold) {
    return ARC_TIMELINE_GESTURE_PENDING;
  }
  if (horizontalDistance > verticalDistance * dominanceRatio) {
    return ARC_TIMELINE_GESTURE_HORIZONTAL;
  }
  if (translationY < 0 && verticalDistance > horizontalDistance * dominanceRatio) {
    return ARC_TIMELINE_GESTURE_CREATE;
  }
  if (translationY > 0 && verticalDistance > horizontalDistance * dominanceRatio) {
    return ARC_TIMELINE_GESTURE_RESET_MAP;
  }
  return ARC_TIMELINE_GESTURE_PENDING;
}

export function resetPullDisplayDistance(
  translationY: number,
  activationDistance = 60,
  maximumDistance = 112,
  resistance = 0.28,
): number {
  'worklet';
  const downwardDistance = Math.max(0, translationY);
  if (downwardDistance <= activationDistance) return Math.min(downwardDistance, maximumDistance);
  return Math.min(maximumDistance, activationDistance + (downwardDistance - activationDistance) * resistance);
}

export function resetPullProgress(
  mode: ArcTimelineGestureMode,
  translationY: number,
  activationDistance = 60,
): number {
  'worklet';
  if (mode !== ARC_TIMELINE_GESTURE_RESET_MAP || activationDistance <= 0) return 0;
  return Math.max(0, Math.min(1, translationY / activationDistance));
}

export function isResetPullArmed(
  mode: ArcTimelineGestureMode,
  translationY: number,
  activationDistance = 60,
): boolean {
  'worklet';
  return mode === ARC_TIMELINE_GESTURE_RESET_MAP && translationY >= activationDistance;
}

export type ResetPullRelease = 'none' | 'cancel' | 'reset';

export function resolveResetPullRelease(
  mode: ArcTimelineGestureMode,
  armed: boolean,
  alreadyCommitted: boolean,
): ResetPullRelease {
  'worklet';
  if (mode !== ARC_TIMELINE_GESTURE_RESET_MAP) return 'none';
  if (!armed) return 'cancel';
  return alreadyCommitted ? 'none' : 'reset';
}

export function createPullDisplayDistance(
  translationY: number,
  activationDistance = 112,
  maximumDistance = 164,
  resistance = 0.32,
): number {
  'worklet';
  const upwardDistance = Math.max(0, -translationY);
  if (upwardDistance <= activationDistance) return Math.min(upwardDistance, maximumDistance);
  return Math.min(
    maximumDistance,
    activationDistance + (upwardDistance - activationDistance) * resistance,
  );
}

export function createPullProgress(
  mode: ArcTimelineGestureMode,
  translationY: number,
  activationDistance = 112,
): number {
  'worklet';
  if (mode !== ARC_TIMELINE_GESTURE_CREATE || activationDistance <= 0) return 0;
  return Math.max(0, Math.min(1, -translationY / activationDistance));
}

export function isCreatePullArmed(
  mode: ArcTimelineGestureMode,
  translationY: number,
  activationDistance = 112,
): boolean {
  'worklet';
  return mode === ARC_TIMELINE_GESTURE_CREATE && -translationY >= activationDistance;
}

export type CreatePullRelease = 'none' | 'cancel' | 'create';

export function resolveCreatePullRelease(
  mode: ArcTimelineGestureMode,
  armed: boolean,
  alreadyCommitted: boolean,
): CreatePullRelease {
  'worklet';
  if (mode !== ARC_TIMELINE_GESTURE_CREATE) return 'none';
  if (!armed) return 'cancel';
  return alreadyCommitted ? 'none' : 'create';
}

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

export function wrapArcTimelineYearIndex(
  index: number,
  itemCount: number,
  firstYearIndex = 0,
): number {
  'worklet';
  const yearCount = itemCount - firstYearIndex;
  if (yearCount <= 0) return firstYearIndex;
  const wrapped = (index - firstYearIndex) % yearCount;
  return firstYearIndex + (wrapped < 0 ? wrapped + yearCount : wrapped);
}

export function nearestCyclicArcTimelineIndex(
  targetIndex: number,
  aroundIndex: number,
  itemCount: number,
  firstYearIndex = 0,
): number {
  'worklet';
  const yearCount = itemCount - firstYearIndex;
  if (yearCount <= 0) return firstYearIndex;
  const wrappedTarget = wrapArcTimelineYearIndex(targetIndex, itemCount, firstYearIndex);
  const turns = Math.round((aroundIndex - wrappedTarget) / yearCount);
  return wrappedTarget + turns * yearCount;
}

export function arcTimelineIndexFromDrag(
  startIndex: number,
  translationX: number,
  pixelsPerYear = 76,
  edgeScrollYears = 0,
): number {
  'worklet';
  return startIndex + translationX / pixelsPerYear + edgeScrollYears;
}

export function visualArcTimelineDragOffset(
  dragOffsetYears: number,
  maximumDragYears = 1.15,
): number {
  'worklet';
  return Math.max(-maximumDragYears, Math.min(maximumDragYears, dragOffsetYears));
}

export function arcTimelineMaxDragYears(
  width: number,
  radiusRatio = 0.54,
  radiusCap = 220,
  stepRadians = 0.32,
  edgeInsetPx = 50,
): number {
  'worklet';
  const radius = Math.min(radiusCap, width * radiusRatio);
  if (radius <= 0) return 0;
  const maximumHorizontalOffset = Math.max(0, width / 2 - edgeInsetPx);
  const angle = Math.asin(Math.min(0.999, maximumHorizontalOffset / radius));
  return angle / stepRadians;
}

export function resolveArcTimelineEdgeDirection(
  previousDirection: number,
  dragOffsetYears: number,
  startYears = 1.15,
  stopYears = 0.85,
): number {
  'worklet';
  if (previousDirection > 0) return dragOffsetYears < stopYears ? 0 : 1;
  if (previousDirection < 0) return dragOffsetYears > -stopYears ? 0 : -1;
  if (dragOffsetYears > startYears) return 1;
  if (dragOffsetYears < -startYears) return -1;
  return 0;
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

export function arcTimelineButtonIndex(
  scrollIndex: number,
  buttonOffsetYears: number,
  itemCount: number,
  maximumDragYears = 1.15,
  firstYearIndex = 0,
): number {
  'worklet';
  return wrapArcTimelineYearIndex(
    Math.round(scrollIndex + visualArcTimelineDragOffset(buttonOffsetYears, maximumDragYears)),
    itemCount,
    firstYearIndex,
  );
}
