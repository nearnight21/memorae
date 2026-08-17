interface LocationLookupOptions {
  attempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function resolveBeforeTimeout<T>(
  lookup: () => Promise<T | null>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timeout = globalThis.setTimeout(() => resolve(null), timeoutMs);
    void lookup().then(
      (result) => {
        globalThis.clearTimeout(timeout);
        resolve(result);
      },
      () => {
        globalThis.clearTimeout(timeout);
        resolve(null);
      },
    );
  });
}

export async function resolveLocationWithRetry<T>(
  lookup: () => Promise<T | null>,
  {
    attempts = 2,
    retryDelayMs = 400,
    timeoutMs = 5_000,
  }: LocationLookupOptions = {},
): Promise<T | null> {
  const totalAttempts = Math.max(1, Math.floor(attempts));
  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const result = await resolveBeforeTimeout(lookup, Math.max(1, timeoutMs));
    if (result) return result;
    if (attempt + 1 < totalAttempts && retryDelayMs > 0) await wait(retryDelayMs);
  }
  return null;
}
