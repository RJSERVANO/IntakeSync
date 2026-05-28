const PERF_DEBUG = __DEV__ || process.env.EXPO_PUBLIC_PERF_DEBUG === 'true';

type PerfExtra = Record<string, string | number | boolean | null | undefined>;

if (PERF_DEBUG) {
  console.log('[perf] Perf diagnostics enabled');
}

export function perfNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function logPerf(label: string, startedAt: number, extra: PerfExtra = {}) {
  if (!PERF_DEBUG) return;

  const durationMs = Math.max(0, Math.round(perfNow() - startedAt));
  const safeExtra = Object.fromEntries(
    Object.entries(extra).filter(([, value]) => value !== undefined)
  );

  console.log('[perf]', {
    label,
    durationMs,
    ...safeExtra,
  });
}
