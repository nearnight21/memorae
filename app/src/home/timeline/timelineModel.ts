export const TIMELINE_ITEM_WIDTH = 82;
export const TIMELINE_MIN_NATURAL_YEARS = 7;
export const TIMELINE_VELOCITY_PROJECTION_SECONDS = 0.12;
export const TIMELINE_EDGE_RESISTANCE = 0.28;

export interface TimelineItem {
  key: string;
  label: string;
  value: string | null;
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
  if (years.length === 0) return [];

  const earliestMemoryYear = Math.min(...years);
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
