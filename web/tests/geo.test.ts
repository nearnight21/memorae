import assert from 'node:assert/strict';
import test from 'node:test';
import { hasResolvedAdministrativeLocation, normalizeGeoResult, normalizeLongitude } from '../src/lib/geo';

test('normalizes longitudes from Leaflet world copies before reverse geocoding', () => {
  assert.equal(normalizeLongitude(-221.00799), 138.99201);
  assert.equal(normalizeLongitude(181), -179);
  assert.equal(normalizeLongitude(-181), 179);
});

test('legacy Shanghai reverse response derives municipality city from formatted address', () => {
  const result = normalizeGeoResult({
    lat: 31.032,
    lng: 121.39,
    country: '中国',
    formattedAddress: '上海市闵行区颛桥镇鑫泽阳光公寓',
  });

  assert.equal(result.province, '上海市');
  assert.equal(result.city, '上海市');
  assert.equal(result.district, '闵行区');
  assert.equal(hasResolvedAdministrativeLocation(result), true);
});

test('legacy province and city are derived from a formatted Chinese address', () => {
  const result = normalizeGeoResult({
    lat: 29.76,
    lng: 121.625,
    country: '中国',
    formattedAddress: '浙江省宁波市鄞州区东钱湖镇环湖东路',
  });

  assert.equal(result.province, '浙江省');
  assert.equal(result.city, '宁波市');
  assert.equal(result.district, '鄞州区');
  assert.equal(hasResolvedAdministrativeLocation(result), true);
});
