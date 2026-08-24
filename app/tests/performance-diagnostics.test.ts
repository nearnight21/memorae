import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePhotoPerformanceMetric } from '../src/services/performanceDiagnostics';

test('照片性能指标只保留阶段、档位、大小和有限耗时', () => {
  const metric = sanitizePhotoPerformanceMetric({
    operation: 'detail',
    kind: 'preview',
    bytes: 1024.4,
    durationsMs: {
      decrypt: 12.6,
      'storage-write': -3,
      'not safe': 20,
      invalid: Number.NaN,
    },
  });

  assert.deepEqual(metric, {
    operation: 'detail',
    kind: 'preview',
    bytes: 1024,
    durationsMs: {
      decrypt: 13,
      'storage-write': 0,
    },
  });
});
