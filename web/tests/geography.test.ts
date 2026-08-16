import assert from 'node:assert/strict';
import test from 'node:test';
import { administrativeLocation } from '../src/lib/geo';

test('中国地点优先提取城市，行政区作为次级地点', () => {
  assert.deepEqual(
    administrativeLocation({}, '东钱湖镇, 鄞州区, 宁波市, 浙江省, 中国'),
    { city: '宁波', district: '鄞州区' },
  );
  assert.deepEqual(
    administrativeLocation({}, '顺城东路北段, 新城区, 西安市, 陕西省, 中国'),
    { city: '西安', district: '新城区' },
  );
});

test('没有完整中文地址时保留地理服务提供的城市字段', () => {
  assert.deepEqual(
    administrativeLocation({ city: 'Kyoto', country: 'Japan' }),
    { city: 'Kyoto', district: undefined },
  );
});
