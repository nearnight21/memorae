const DAY_MS = 24 * 60 * 60 * 1000;

export const CRYSTAL_TIMELINE_MIN_DATE = new Date(Date.UTC(2021, 0, 1));
export const CRYSTAL_TIMELINE_MAX_DATE = new Date(Date.UTC(2025, 11, 31));
export const CRYSTAL_TIMELINE_INITIAL_DATE = new Date(Date.UTC(2024, 5, 18));

export const clampProgress = (progress: number): number => Math.min(1, Math.max(0, progress));

export const dateToTimelineProgress = (
  date: Date,
  minDate = CRYSTAL_TIMELINE_MIN_DATE,
  maxDate = CRYSTAL_TIMELINE_MAX_DATE,
): number => {
  const span = maxDate.getTime() - minDate.getTime();
  if (span <= 0) return 0;
  return clampProgress((date.getTime() - minDate.getTime()) / span);
};

export const timelineProgressToDate = (
  progress: number,
  minDate = CRYSTAL_TIMELINE_MIN_DATE,
  maxDate = CRYSTAL_TIMELINE_MAX_DATE,
): Date => {
  const span = maxDate.getTime() - minDate.getTime();
  const timestamp = minDate.getTime() + span * clampProgress(progress);
  return new Date(Math.round(timestamp / DAY_MS) * DAY_MS);
};

export const timelineYearProgress = (year: number): number =>
  dateToTimelineProgress(new Date(Date.UTC(year, 0, 1)));

export const formatTimelineDate = (date: Date): string =>
  `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;

export const formatTimelineMonth = (date: Date): string =>
  `${date.getUTCFullYear()} · ${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
