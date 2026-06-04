const buckets = new Map();

export function rateLimit(request, scope, { limit, windowMs }) {
  const now = Date.now();
  const forwarded = request.headers.get("x-forwarded-for");
  const client = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const key = `${scope}:${client}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    prune(now);
    return { allowed: true, retryAfter: 0 };
  }

  current.count += 1;
  if (current.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfter: 0 };
}

function prune(now) {
  if (buckets.size < 500) return;
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}
