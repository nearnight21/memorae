import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLocationWithRetry } from '../src/lib/locationLookup.ts';

test('地点识别首次成功时不产生多余请求', async () => {
  let calls = 0;
  const result = await resolveLocationWithRetry(async () => {
    calls += 1;
    return { city: '乌鲁木齐' };
  }, { attempts: 2, retryDelayMs: 0, timeoutMs: 50 });

  assert.deepEqual(result, { city: '乌鲁木齐' });
  assert.equal(calls, 1);
});

test('地点识别瞬时失败后自动重试', async () => {
  let calls = 0;
  const result = await resolveLocationWithRetry(async () => {
    calls += 1;
    return calls === 1 ? null : { city: '乌鲁木齐' };
  }, { attempts: 2, retryDelayMs: 0, timeoutMs: 50 });

  assert.deepEqual(result, { city: '乌鲁木齐' });
  assert.equal(calls, 2);
});

test('地点识别连续异常后返回可确认的空结果', async () => {
  let calls = 0;
  const result = await resolveLocationWithRetry(async () => {
    calls += 1;
    throw new Error('temporary failure');
  }, { attempts: 2, retryDelayMs: 0, timeoutMs: 50 });

  assert.equal(result, null);
  assert.equal(calls, 2);
});

test('地点识别超时后继续下一次尝试', async () => {
  let calls = 0;
  const result = await resolveLocationWithRetry(() => {
    calls += 1;
    if (calls === 1) return new Promise(() => undefined);
    return Promise.resolve({ city: '乌鲁木齐' });
  }, { attempts: 2, retryDelayMs: 0, timeoutMs: 5 });

  assert.deepEqual(result, { city: '乌鲁木齐' });
  assert.equal(calls, 2);
});
