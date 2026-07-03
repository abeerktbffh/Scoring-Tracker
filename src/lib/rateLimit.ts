// In-memory fixed-window-ish rate limiter keyed by an arbitrary string
// (e.g. an email address or IP). Not distributed/durable — resets on
// process restart and is per-instance, which is fine for this app's scale.
// NOTE: Date.now() is fine here (this is app code, not a workflow script).

const hits = new Map<string, number[]>();

/**
 * Records a hit for `key` and reports whether it's allowed under the limit.
 * Returns true (and records the hit) if fewer than `maxPerWindow` hits have
 * occurred for `key` within the trailing `windowMs`; otherwise returns false
 * without recording the hit.
 */
export function rateLimit(key: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;

  const existing = hits.get(key) ?? [];
  const recent = existing.filter((t) => t > windowStart);

  if (recent.length >= maxPerWindow) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);
  return true;
}
