import assert from 'node:assert/strict';
import test from 'node:test';
import { getOrCreatePreviewRequest, openMemoryWithPreview } from '../src/components/previewRequests';

test('点击记忆时会先启动首张 preview 请求再打开详情', () => {
  const events: string[] = [];
  let resolvePreview: ((source: string) => void) | undefined;
  const previewRequest = new Promise<string>((resolve) => {
    resolvePreview = resolve;
  });

  openMemoryWithPreview(
    { id: 'memory-001', photoIds: ['photo-001', 'photo-002'] },
    (photoId) => {
      events.push(`preview:${photoId}`);
      return previewRequest;
    },
    (memory) => events.push(`open:${memory.id}`),
  );

  assert.deepEqual(events, ['preview:photo-001', 'open:memory-001']);
  resolvePreview?.('blob:preview');
});

test('effect 重启会复用同一 preview 请求并把结果交给当前订阅者', async () => {
  let requestCount = 0;
  let resolvePreview: ((source: string) => void) | undefined;
  const pendingRequests = new Map<string, Promise<string>>();
  const updates: string[] = [];
  const loadPreview = () => {
    requestCount += 1;
    return new Promise<string>((resolve) => {
      resolvePreview = resolve;
    });
  };

  let firstEffectActive = true;
  const firstRequest = getOrCreatePreviewRequest(pendingRequests, 'photo-001', loadPreview);
  void firstRequest.then((source) => {
    if (firstEffectActive) updates.push(`first:${source}`);
  });

  firstEffectActive = false;
  let currentEffectActive = true;
  const currentRequest = getOrCreatePreviewRequest(pendingRequests, 'photo-001', loadPreview);
  void currentRequest.then((source) => {
    if (currentEffectActive) updates.push(`current:${source}`);
  });

  assert.equal(currentRequest, firstRequest);
  assert.equal(requestCount, 1);

  resolvePreview?.('blob:preview');
  await currentRequest;
  await Promise.resolve();

  assert.deepEqual(updates, ['current:blob:preview']);
  assert.equal(pendingRequests.size, 0);
  currentEffectActive = false;
});

test('失败的 preview 请求会从共享任务中移除以允许重试', async () => {
  let requestCount = 0;
  const pendingRequests = new Map<string, Promise<string>>();
  const loadPreview = async () => {
    requestCount += 1;
    if (requestCount === 1) throw new Error('temporary failure');
    return 'blob:preview';
  };

  await assert.rejects(getOrCreatePreviewRequest(pendingRequests, 'photo-001', loadPreview));
  assert.equal(pendingRequests.size, 0);
  assert.equal(
    await getOrCreatePreviewRequest(pendingRequests, 'photo-001', loadPreview),
    'blob:preview',
  );
  assert.equal(requestCount, 2);
});
