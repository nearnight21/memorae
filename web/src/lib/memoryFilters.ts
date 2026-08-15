import type { Memory, MemoryDateRange, MemoryFilters } from '../types';

export const EMPTY_MEMORY_FILTERS: MemoryFilters = {
  dateRange: null,
  regions: [],
  themes: [],
};

const normalizeDate = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/[.\-/]/).map((part) => part.padStart(2, '0'));
  if (parts.length === 1) return /^\d{4}$/.test(parts[0]) ? `${parts[0]}-01-01` : parts[0];
  return `${parts[0]}-${parts[1]}-${parts[2] ?? '01'}`;
};

export const memoryDateOf = (memory: Memory): string => normalizeDate(memory.date || `${memory.year}-01-01`);

export const memoryDateValue = (memory: Memory): Date => {
  const normalized = memoryDateOf(memory);
  const timestamp = Date.parse(`${normalized}T00:00:00Z`);
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date(Date.UTC(memory.year, 0, 1));
};

const matchesDateRange = (memory: Memory, dateRange: MemoryDateRange | null): boolean => {
  if (!dateRange || (!dateRange.start && !dateRange.end)) return true;
  const date = memoryDateOf(memory);
  const start = dateRange.start ? normalizeDate(dateRange.start) : null;
  const end = dateRange.end ? normalizeDate(dateRange.end) : null;
  return (!start || date >= start) && (!end || date <= end);
};

const regionValuesOf = (memory: Memory): string[] => [
  memory.country,
  memory.city,
  memory.location?.name,
]
  .map((value) => value?.trim())
  .filter((value): value is string => Boolean(value));

export const isMemoryFiltersActive = (filters: MemoryFilters): boolean => Boolean(
  (filters.dateRange && (filters.dateRange.start || filters.dateRange.end)) ||
  filters.regions.length > 0 ||
  filters.themes.length > 0,
);

export const filterMemories = (memories: Memory[], filters: MemoryFilters): Memory[] => memories.filter((memory) => {
  const regionMatches = filters.regions.length === 0 || filters.regions.some((region) =>
    regionValuesOf(memory).some((value) => value === region)
  );
  const themeMatches = filters.themes.length === 0 || filters.themes.includes(memory.category);
  return regionMatches && themeMatches && matchesDateRange(memory, filters.dateRange);
});

export const yearDateRange = (year: number): MemoryDateRange => ({
  start: `${year}-01-01`,
  end: `${year}-12-31`,
});

export const yearFromDateRange = (dateRange: MemoryDateRange | null): number | null => {
  if (!dateRange?.start || !dateRange.end) return null;
  const start = normalizeDate(dateRange.start);
  const end = normalizeDate(dateRange.end);
  if (start.slice(0, 4) !== end.slice(0, 4) || !/^\d{4}-/.test(start)) return null;
  return Number(start.slice(0, 4));
};
