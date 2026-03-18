type Bucket = { resetAt: number; count: number };

export function createFixedWindowRateLimiter(opts?: { windowMs?: number; maxBuckets?: number }) {
  const windowMs = Math.max(1000, Number(opts?.windowMs || 60_000));
  const maxBuckets = Math.max(1000, Number(opts?.maxBuckets || 20_000));
  const buckets = new Map<string, Bucket>();

  function cleanup(now: number) {
    if (buckets.size <= maxBuckets) return;
    for (const [k, v] of buckets) {
      if (now >= v.resetAt) buckets.delete(k);
      if (buckets.size <= maxBuckets) break;
    }
  }

  return {
    hit(key: string, limit: number, now = Date.now()): { ok: boolean; remaining: number; resetAt: number } {
      const l = Math.max(1, Number(limit || 1));
      const b = buckets.get(key);
      if (!b || now >= b.resetAt) {
        const resetAt = now + windowMs;
        buckets.set(key, { resetAt, count: 1 });
        cleanup(now);
        return { ok: true, remaining: l - 1, resetAt };
      }
      b.count += 1;
      cleanup(now);
      const remaining = Math.max(0, l - b.count);
      return { ok: b.count <= l, remaining, resetAt: b.resetAt };
    },
  };
}

