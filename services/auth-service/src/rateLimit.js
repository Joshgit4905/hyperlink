/**
 * Fixed-window, in-memory rate limiter for login attempts.
 * The key combines client IP and email, so one attacker cannot lock out other users,
 * and one IP cannot brute-force a single account.
 * (Single instance only: a multi-instance deployment would need Redis or similar.)
 */
export function createLoginLimiter({ max, windowMs }) {
  const hits = new Map();

  function check(key) {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      return { allowed: true };
    }
    entry.count += 1;
    if (entry.count > max) {
      return { allowed: false, retryAfter: Math.ceil((entry.start + windowMs - now) / 1000) };
    }
    return { allowed: true };
  }

  function reset(key) {
    hits.delete(key);
  }

  // Housekeeping so the map does not grow forever.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
  }, windowMs);
  timer.unref();

  return { check, reset };
}
