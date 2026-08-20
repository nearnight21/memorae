import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapViewSource = readFileSync(
  new URL('../src/components/MapView.tsx', import.meta.url),
  'utf8',
);

test('single-memory country bubbles finish drilling down before opening the memory', () => {
  const handlerStart = mapViewSource.indexOf('const handleCountryClick');
  const foreignMarkerStart = mapViewSource.indexOf('const addForeignCountryMarkers', handlerStart);

  assert.notEqual(handlerStart, -1);
  assert.notEqual(foreignMarkerStart, -1);

  const handler = mapViewSource.slice(handlerStart, foreignMarkerStart);
  assert.match(handler, /list: Memory\[\]/);
  assert.match(handler, /map\.once\('moveend', \(\) => onSelectMemory\(list\[0\]\)\)/);
  assert.match(handler, /map\.flyTo\(coords, CITY_ZOOM/);
  assert.ok(handler.indexOf("map.once('moveend'") < handler.indexOf('map.flyTo(coords, CITY_ZOOM'));

  const countryMarkers = mapViewSource.match(/handleCountryClick\(coords, list\)/g) ?? [];
  assert.equal(countryMarkers.length, 2);
});
