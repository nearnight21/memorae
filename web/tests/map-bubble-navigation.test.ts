import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapViewSource = readFileSync(
  new URL('../src/components/MapView.tsx', import.meta.url),
  'utf8',
);

test('single-memory country bubbles reach the concrete point without opening the memory', () => {
  const handlerStart = mapViewSource.indexOf('const handleCountryClick');
  const foreignMarkerStart = mapViewSource.indexOf('const addForeignCountryMarkers', handlerStart);

  assert.notEqual(handlerStart, -1);
  assert.notEqual(foreignMarkerStart, -1);

  const handler = mapViewSource.slice(handlerStart, foreignMarkerStart);
  assert.match(handler, /list: Memory\[\]/);
  assert.match(handler, /if \(list\.length !== 1\)[\s\S]*map\.flyTo\(coords, CITY_ZOOM/);
  assert.match(handler, /averageMemoryCoordinates\(list\)[\s\S]*resolvePlace\(countryOf\(memory\), cityOf\(memory\)\)/);
  assert.match(handler, /map\.flyTo\(memoryCoords, POINT_ZOOM/);
  assert.doesNotMatch(handler, /onSelectMemory/);
  assert.doesNotMatch(handler, /map\.once\('moveend'/);

  const countryMarkers = mapViewSource.match(/void handleCountryClick\(coords, list\)/g) ?? [];
  assert.equal(countryMarkers.length, 2);
});

test('单条记忆国家气泡直接使用记忆的真实坐标以保持相机推进方向一致', () => {
  assert.match(mapViewSource, /const resolveCountryMarkerCoords = async/);
  assert.match(mapViewSource, /if \(list\.length === 1\) \{[\s\S]*averageMemoryCoordinates\(list\)[\s\S]*resolvePlace\(countryOf\(memory\), cityOf\(memory\)\)/);
  assert.match(mapViewSource, /coords: await resolveCountryMarkerCoords\(country, list\)/);
});
