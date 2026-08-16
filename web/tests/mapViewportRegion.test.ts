import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentRegionForViewport,
  type GeographicBounds,
  type ViewportRegionCandidate,
} from '../src/lib/mapViewportRegion';

const eastAsia: GeographicBounds = { north: 48, south: 18, west: 98, east: 146 };
const china: GeographicBounds = { north: 54, south: 18, west: 73, east: 135 };
const zhejiang: GeographicBounds = { north: 31.6, south: 28.5, west: 118.2, east: 122.2 };
const ningbo: GeographicBounds = { north: 30.2, south: 29.5, west: 121.1, east: 122.0 };

const candidates: ViewportRegionCandidate[] = [
  { country: '中国', city: '宁波', lat: 29.87, lng: 121.55 },
  { country: '中国', city: '杭州', lat: 30.27, lng: 120.16 },
  { country: '日本', city: '东京', lat: 35.68, lng: 139.65 },
];

test('wide multi-country viewport is all regions', () => {
  assert.equal(currentRegionForViewport(4, eastAsia, candidates), null);
});

test('country-scale viewport resolves a country', () => {
  assert.deepEqual(currentRegionForViewport(6, china, candidates), {
    name: '中国', scope: 'country', country: '中国',
  });
});

test('multiple city viewport falls back to the common province', () => {
  assert.deepEqual(currentRegionForViewport(8, zhejiang, candidates), {
    name: '浙江', scope: 'province', country: '中国',
  });
});

test('city-scale viewport resolves a city', () => {
  assert.deepEqual(currentRegionForViewport(9, ningbo, candidates), {
    name: '宁波', scope: 'city', country: '中国',
  });
});

test('a city remains current when its neighbour is only at the viewport edge', () => {
  const broadNingbo: GeographicBounds = { north: 31.4, south: 28.4, west: 120.1, east: 123.0 };
  assert.deepEqual(currentRegionForViewport(9, broadNingbo, candidates), {
    name: '宁波', scope: 'city', country: '中国',
  });
});
