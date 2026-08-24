import type { PhotoKind } from '../crypto';

export type PhotoPerformanceOperation = 'encrypt' | 'upload' | 'download' | 'detail';

export interface PhotoPerformanceMetric {
  operation: PhotoPerformanceOperation;
  kind?: PhotoKind;
  bytes?: number;
  durationsMs: Readonly<Record<string, number>>;
}

/** Keep diagnostics useful on a real device without retaining private identifiers. */
export function sanitizePhotoPerformanceMetric(metric: PhotoPerformanceMetric): {
  operation: PhotoPerformanceOperation;
  kind?: PhotoKind;
  bytes?: number;
  durationsMs: Record<string, number>;
} {
  const durationsMs: Record<string, number> = {};
  for (const [stage, duration] of Object.entries(metric.durationsMs)) {
    if (!/^[a-z0-9-]+$/.test(stage) || !Number.isFinite(duration)) continue;
    durationsMs[stage] = Math.max(0, Math.round(duration));
  }
  const bytes = metric.bytes !== undefined && Number.isFinite(metric.bytes)
    ? Math.max(0, Math.round(metric.bytes))
    : undefined;
  return {
    operation: metric.operation,
    ...(metric.kind ? { kind: metric.kind } : {}),
    ...(bytes !== undefined ? { bytes } : {}),
    durationsMs,
  };
}
