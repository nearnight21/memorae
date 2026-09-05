export const TIMELINE_TICK_STEPS = [1, 2, 5, 10, 20, 50] as const;

export interface TimelineTicks {
  majorYears: number[];
  minorYears: number[];
  step: number;
}

interface TimelineTickOptions {
  width?: number;
  minLabelSpacing?: number;
  maxMajorTicks?: number;
}

const normalizeYear = (value: number): number => Math.trunc(value);

const labelsForStep = (minYear: number, maxYear: number, step: number): number[] => {
  const firstAligned = Math.ceil(minYear / step) * step;
  const years = [minYear];
  for (let year = firstAligned; year <= maxYear; year += step) {
    if (year > minYear && year < maxYear) years.push(year);
  }
  if (maxYear !== minYear) years.push(maxYear);
  return [...new Set(years)].sort((left, right) => left - right);
};

const withoutCrowdedEndpointNeighbors = (
  years: number[],
  minYear: number,
  maxYear: number,
  width: number,
  minLabelSpacing: number,
): number[] => {
  const span = maxYear - minYear;
  if (span <= 0 || years.length <= 2) return years;
  const endpointSpacing = minLabelSpacing;
  return years.filter((year, index) => {
    if (index === 0 || index === years.length - 1) return true;
    const fromStart = ((year - minYear) / span) * width;
    const fromEnd = ((maxYear - year) / span) * width;
    return fromStart >= endpointSpacing && fromEnd >= endpointSpacing;
  });
};

export const getTimelineTicks = (
  minYearInput: number,
  maxYearInput: number,
  options: TimelineTickOptions = {},
): TimelineTicks => {
  const minYear = normalizeYear(Math.min(minYearInput, maxYearInput));
  const maxYear = normalizeYear(Math.max(minYearInput, maxYearInput));
  const width = Math.max(1, options.width ?? 1028);
  const minLabelSpacing = Math.max(1, options.minLabelSpacing ?? 88);
  const maxMajorTicks = Math.max(2, Math.trunc(options.maxMajorTicks ?? 9));
  const widthCapacity = Math.max(2, Math.floor(width / minLabelSpacing) + 1);
  const targetCount = Math.min(maxMajorTicks, widthCapacity);
  const span = maxYear - minYear;
  const step = TIMELINE_TICK_STEPS.find((candidate) => labelsForStep(minYear, maxYear, candidate).length <= targetCount)
    ?? TIMELINE_TICK_STEPS[TIMELINE_TICK_STEPS.length - 1];
  const majorYears = withoutCrowdedEndpointNeighbors(
    labelsForStep(minYear, maxYear, step),
    minYear,
    maxYear,
    width,
    minLabelSpacing,
  );
  const minorStep = Math.max(1, Math.ceil(step / 5));
  const firstMajor = majorYears[0] ?? minYear;
  const majorSet = new Set(majorYears);
  const minorYears: number[] = [];
  if (span > 1 && minorStep < step) {
    for (let year = minYear; year <= maxYear; year += 1) {
      if (!majorSet.has(year) && (year - firstMajor) % minorStep === 0) minorYears.push(year);
    }
  }
  return { majorYears, minorYears, step };
};
