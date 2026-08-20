import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapViewSource = readFileSync(
  new URL('../src/components/MapView.tsx', import.meta.url),
  'utf8',
);

test('single-memory country bubbles open the memory after drilling down', () => {
  const handlerStart = mapViewSource.indexOf('const handleCountryClick');
  const foreignMarkerStart = mapViewSource.indexOf('const addForeignCountryMarkers', handlerStart);

  assert.notEqual(handlerStart, -1);
  assert.notEqual(foreignMarkerStart, -1);

  const handler = mapViewSource.slice(handlerStart, foreignMarkerStart);
  assert.match(handler, /list: Memory\[\]/);
  assert.match(handler, /map\.flyTo\(coords, CITY_ZOOM/);
  assert.match(handler, /if \(list\.length === 1\) onSelectMemory\(list\[0\]\)/);

  const countryMarkers = mapViewSource.match(/handleCountryClick\(coords, list\)/g) ?? [];
  assert.equal(countryMarkers.length, 2);
});
