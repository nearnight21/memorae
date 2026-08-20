import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapViewSource = readFileSync(
  new URL('../src/components/MapView.tsx', import.meta.url),
  'utf8',
);

test('single-memory country bubbles reach the concrete city before opening the memory', () => {
  const handlerStart = mapViewSource.indexOf('const handleCountryClick');
  const foreignMarkerStart = mapViewSource.indexOf('const addForeignCountryMarkers', handlerStart);

  assert.notEqual(handlerStart, -1);
  assert.notEqual(foreignMarkerStart, -1);

  const handler = mapViewSource.slice(handlerStart, foreignMarkerStart);
  assert.match(handler, /list: Memory\[\]/);
  assert.match(handler, /if \(list\.length !== 1\)[\s\S]*map\.flyTo\(coords, CITY_ZOOM/);
  assert.match(handler, /averageMemoryCoordinates\(list\)[\s\S]*resolvePlace\(countryOf\(memory\), cityOf\(memory\)\)/);
  assert.match(handler, /map\.once\('moveend',[\s\S]*setFocusedRegion\(\{ name: city, scope: 'city', country \}\)[\s\S]*onSelectMemory\(memory\)/);
  assert.match(handler, /map\.flyTo\(memoryCoords, POINT_ZOOM/);
  assert.ok(handler.indexOf("map.once('moveend'") < handler.indexOf('map.flyTo(memoryCoords, POINT_ZOOM'));

  const countryMarkers = mapViewSource.match(/void handleCountryClick\(coords, list\)/g) ?? [];
  assert.equal(countryMarkers.length, 2);
});
