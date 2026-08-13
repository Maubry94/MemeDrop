import assert from 'node:assert/strict'
import test from 'node:test'
import { createFixedWindowRateLimiter, createTokenBucket } from './rateLimit.js'

test('fixed-window limiter resets and bounds distinct keys', () => {
  const limiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 1 })

  assert.equal(limiter.consume('first', 0), true)
  assert.equal(limiter.consume('first', 1), true)
  assert.equal(limiter.consume('first', 2), false)
  assert.equal(limiter.consume('second', 2), false)
  assert.equal(limiter.consume('second', 1000), true)
})

test('token bucket accepts bursts then refills gradually', () => {
  let currentTime = 0
  const bucket = createTokenBucket({
    capacity: 2,
    refillPerSecond: 1,
    now: () => currentTime,
  })

  assert.equal(bucket.consume(), true)
  assert.equal(bucket.consume(), true)
  assert.equal(bucket.consume(), false)
  currentTime = 1000
  assert.equal(bucket.consume(), true)
  assert.equal(bucket.consume(), false)
})
