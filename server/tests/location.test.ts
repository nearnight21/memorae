import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildApp } from '../src/app.ts';
import {
  AmapWebLocationService,
  type LocationService,
} from '../src/location.ts';
import { JsonCipherStore } from '../src/store.ts';

const localToken = 'location-test-token';

function bearer(): Record<string, string> {
  return { authorization: `Bearer ${localToken}` };
}

test('高德服务保持输入提示坐标，并将反查和 GPS 转换归一为项目地点数据', async () => {
  const requested: string[] = [];
  const service = new AmapWebLocationService({
    key: 'private-service-key',
    fetch: async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.includes('/inputtips')) {
        return Response.json({
          status: '1',
          tips: [{
            name: '东钱湖',
            location: [],
          }, {
            id: 'B0FF-test',
            name: '东钱湖',
            location: '121.625,29.760',
            district: '鄞州区',
            address: '环湖东路',
            adcode: '330212',
          }],
        });
      }
      if (url.includes('/regeo')) {
        return Response.json({
          status: '1',
          regeocode: {
            formatted_address: '浙江省宁波市鄞州区东钱湖镇环湖东路',
            addressComponent: { country: '中国', province: '浙江省', city: '宁波市', district: '鄞州区', adcode: '330212' },
            pois: [{ name: '东钱湖' }],
          },
        });
      }
      return Response.json({ status: '1', locations: '121.629,29.756' });
    },
  });

  const suggestions = await service.suggest('东钱湖', '330200');
  assert.deepEqual(suggestions, [{
    shortName: '东钱湖',
    displayName: '鄞州区 · 环湖东路',
    lat: 29.76,
    lng: 121.625,
    provider: 'amap',
    providerId: 'B0FF-test',
    district: '鄞州区',
    adcode: '330212',
    poiId: 'B0FF-test',
  }]);

  const reverse = await service.reverse({ lat: 29.76, lng: 121.625 });
  assert.deepEqual(reverse, {
    lat: 29.76,
    lng: 121.625,
    label: '东钱湖',
    placeName: '东钱湖',
    formattedAddress: '浙江省宁波市鄞州区东钱湖镇环湖东路',
    provider: 'amap',
    country: '中国',
    province: '浙江省',
    city: '宁波市',
    district: '鄞州区',
    adcode: '330212',
  });

  assert.deepEqual(await service.convertGps({ lat: 29.75, lng: 121.62 }), { lat: 29.756, lng: 121.629 });
  assert.match(requested[0], /city=330200/);
  assert.match(requested[2], /coordsys=gps/);
});

test('高德直辖市反查在 city 为空时使用省级名称作为城市', async () => {
  for (const province of ['北京市', '上海市', '天津市', '重庆市']) {
    const service = new AmapWebLocationService({
      key: 'private-service-key',
      fetch: async () => Response.json({
        status: '1',
        regeocode: {
          formatted_address: `${province}某区某路`,
          addressComponent: {
            country: '中国',
            province,
            city: [],
            district: `${province.slice(0, 2)}区`,
            adcode: '110101',
          },
        },
      }),
    });

    const result = await service.reverse({ lat: 39.9, lng: 116.4 });
    assert.equal(result?.province, province);
    assert.equal(result?.city, province);
  }
});

test('地点代理需要账号令牌，并在未配置服务时明确提示', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-recall-location-'));
  const app = await buildApp({
    store: new JsonCipherStore(join(directory, 'store.json')),
    localToken,
  });
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  assert.equal((await app.inject({ method: 'GET', url: '/v1/location/suggest?q=宁波' })).statusCode, 401);
  const unavailable = await app.inject({
    method: 'GET',
    url: '/v1/location/suggest?q=宁波',
    headers: bearer(),
  });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), {
    error: '地点服务尚未配置。',
    code: 'location_service_unavailable',
  });
});

test('地点代理只返回服务端选择的地点结果', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-recall-location-'));
  const calls: string[] = [];
  const locationService: LocationService = {
    async suggest(query, adcode) {
      calls.push(`suggest:${query}:${adcode ?? ''}`);
      return [{ provider: 'amap', providerId: 'B0FF-test', shortName: '东钱湖', displayName: '宁波 · 东钱湖', lat: 29.76, lng: 121.625 }];
    },
    async reverse({ lat, lng }) {
      calls.push(`reverse:${lat}:${lng}`);
      return { lat, lng, label: '东钱湖', placeName: '东钱湖', provider: 'amap', country: '中国', province: '浙江省', city: '宁波市', district: '鄞州区' };
    },
    async convertGps({ lat, lng }) {
      calls.push(`convert:${lat}:${lng}`);
      return { lat: lat + 0.001, lng: lng + 0.001 };
    },
  };
  const app = await buildApp({
    store: new JsonCipherStore(join(directory, 'store.json')),
    localToken,
    locationService,
  });
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const suggestions = await app.inject({
    method: 'GET',
    url: '/v1/location/suggest?q=东钱湖&adcode=330200',
    headers: bearer(),
  });
  assert.equal(suggestions.statusCode, 200);
  assert.deepEqual(suggestions.json(), [{ provider: 'amap', providerId: 'B0FF-test', shortName: '东钱湖', displayName: '宁波 · 东钱湖', lat: 29.76, lng: 121.625 }]);

  const reverse = await app.inject({
    method: 'GET',
    url: '/v1/location/reverse?lat=29.76&lng=121.625',
    headers: bearer(),
  });
  assert.equal(reverse.statusCode, 200);
  assert.equal((reverse.json() as { lng: number }).lng, 121.625);

  const converted = await app.inject({
    method: 'POST',
    url: '/v1/location/convert-gps',
    headers: { ...bearer(), 'content-type': 'application/json' },
    payload: JSON.stringify({ lat: 29.75, lng: 121.62 }),
  });
  assert.equal(converted.statusCode, 200);
  const convertedBody = converted.json() as { lat: number; lng: number };
  assert.equal(convertedBody.lat, 29.751);
  assert.ok(Math.abs(convertedBody.lng - 121.621) < 0.000_001);
  assert.deepEqual(calls, [
    'suggest:东钱湖:330200',
    'reverse:29.76:121.625',
    'convert:29.75:121.62',
  ]);
});
