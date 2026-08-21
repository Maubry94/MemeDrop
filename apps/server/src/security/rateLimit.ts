type FixedWindowRateLimiterOptions = {
  limit: number
  windowMs: number
  maxKeys?: number
}

type FixedWindowEntry = {
  count: number
  resetAt: number
}

export const createFixedWindowRateLimiter = ({
  limit,
  windowMs,
  maxKeys = 1024,
}: FixedWindowRateLimiterOptions) => {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('Rate-limit count must be a positive integer.')
  }
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error('Rate-limit window must be a positive integer.')
  }
  if (!Number.isSafeInteger(maxKeys) || maxKeys <= 0) {
    throw new Error('Rate-limit key capacity must be a positive integer.')
  }

  const entries = new Map<string, FixedWindowEntry>()

  const pruneExpired = (now: number) => {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) {
        entries.delete(key)
      }
    }
  }

  const consume = (key: string, now = Date.now()) => {
    const normalizedKey = key || 'unknown'
    const existing = entries.get(normalizedKey)

    if (existing && existing.resetAt > now) {
      if (existing.count >= limit) {
        return false
      }

      existing.count += 1
      return true
    }

    if (existing) {
      entries.delete(normalizedKey)
    }

    if (entries.size >= maxKeys) {
      pruneExpired(now)
      if (entries.size >= maxKeys) {
        return false
      }
    }

    entries.set(normalizedKey, {
      count: 1,
      resetAt: now + windowMs,
    })
    return true
  }

  return { consume }
}

type TokenBucketOptions = {
  capacity: number
  refillPerSecond: number
  now?: () => number
}

export const createTokenBucket = ({
  capacity,
  refillPerSecond,
  now = Date.now,
}: TokenBucketOptions) => {
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error('Token-bucket capacity must be positive.')
  }
  if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) {
    throw new Error('Token-bucket refill rate must be positive.')
  }

  let tokens = capacity
  let updatedAt = now()

  const consume = (cost = 1) => {
    if (!Number.isFinite(cost) || cost <= 0 || cost > capacity) {
      return false
    }

    const currentTime = now()
    const elapsedMs = Math.max(0, currentTime - updatedAt)
    tokens = Math.min(capacity, tokens + (elapsedMs / 1000) * refillPerSecond)
    updatedAt = Math.max(updatedAt, currentTime)

    if (tokens < cost) {
      return false
    }

    tokens -= cost
    return true
  }

  return { consume }
}
