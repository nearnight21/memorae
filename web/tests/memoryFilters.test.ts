import test from 'node:test';
import assert from 'node:assert/strict';
import type { Memory } from '../src/types';
import {
  EMPTY_MEMORY_FILTERS,
  filterMemories,
  isMemoryFiltersActive,
  throughDateRange,
  yearDateRange,
} from '../src/lib/memoryFilters';

const memory = (overrides: Partial<Memory>): Memory => ({
  id: 'memory',
  title: 'Test memory',
  date: '2025.04.10',
  year: 2025,
  category: 'travel',
  tag: '',
  image: '',
  gallery: [],
  pastSelf: '',
  presentSelf: '',
  pinnedBy: 'pin',
  px: 0,
  py: 0,
  rotation: 0,
  ...overrides,
});

test('empty filters return all memories and are inactive', () => {
  const memories = [memory({ id: 'a' }), memory({ id: 'b', year: 2024 })];
  assert.deepEqual(filterMemories(memories, EMPTY_MEMORY_FILTERS), memories);
  assert.equal(isMemoryFiltersActive(EMPTY_MEMORY_FILTERS), false);
});

test('date, region and theme filters combine with AND semantics', () => {
  const memories = [
    memory({ id: 'match', country: '中国', category: 'growth' }),
    memory({ id: 'wrong-region', country: '日本', category: 'growth' }),
    memory({ id: 'wrong-theme', country: '中国', category: 'travel' }),
    memory({ id: 'wrong-date', country: '中国', category: 'growth', date: '2024.04.10', year: 2024 }),
  ];
  const result = filterMemories(memories, {
    dateRange: yearDateRange(2025),
    regions: ['中国'],
    themes: ['growth'],
  });
  assert.deepEqual(result.map((item) => item.id), ['match']);
  assert.equal(isMemoryFiltersActive({ dateRange: yearDateRange(2025), regions: [], themes: [] }), true);
});

test('timeline range keeps earlier memories visible when the handle is moved later', () => {
  const memories = [
    memory({ id: 'earlier', date: '2021.06.18', year: 2021 }),
    memory({ id: 'later', date: '2023.02.03', year: 2023 }),
  ];
  const through2022 = filterMemories(memories, {
    ...EMPTY_MEMORY_FILTERS,
    dateRange: { start: '2021-01-01', end: '2022-12-31' },
  });

  assert.deepEqual(through2022.map((item) => item.id), ['earlier']);
});

test('timeline cutoff includes the selected year and excludes memories after it', () => {
  const memories = [
    memory({ id: '2007', date: '2007', year: 2007 }),
    memory({ id: '2008', date: '2008', year: 2008 }),
  ];
  const through2007 = filterMemories(memories, {
    ...EMPTY_MEMORY_FILTERS,
    dateRange: throughDateRange(new Date('2007-01-01T00:00:00Z'), new Date('2007-12-31T00:00:00Z')),
  });

  assert.deepEqual(through2007.map((item) => item.id), ['2007']);
});

test('region filters match country, city and location labels', () => {
  const memories = [
    memory({ id: 'country', country: '中国' }),
    memory({ id: 'city', city: '上海' }),
    memory({ id: 'location', location: { name: '外婆家', mx: 50, my: 50 } }),
  ];
  assert.deepEqual(filterMemories(memories, { ...EMPTY_MEMORY_FILTERS, regions: ['上海'] }).map((item) => item.id), ['city']);
  assert.deepEqual(filterMemories(memories, { ...EMPTY_MEMORY_FILTERS, regions: ['外婆家'] }).map((item) => item.id), ['location']);
});
