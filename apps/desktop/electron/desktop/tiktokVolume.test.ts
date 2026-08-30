import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyTikTokPlayerVolume,
  isTikTokPlayerFrameUrl,
} from './tiktokVolume.ts'

const VIDEO_ID = '7123456789012345678'
const PLAYER_URL = `https://www.tiktok.com/player/v1/${VIDEO_ID}?autoplay=1`
const noWait = async () => {}

const successfulResult = (volume: number, generation: number) => ({
  appliedCount: 1,
  generation,
  mediaCount: 1,
  mutedCount: volume === 0 ? 1 : 0,
  volume: volume / 100,
})

const createFrame = (
  executeJavaScript: (code: string) => Promise<unknown>,
  url = PLAYER_URL,
  destroyed = false,
) => ({
  executeJavaScript,
  isDestroyed: () => destroyed,
  url,
})

test('accepts only the exact HTTPS TikTok player frame for the expected video', () => {
  assert.equal(isTikTokPlayerFrameUrl(PLAYER_URL, VIDEO_ID), true)
  assert.equal(
    isTikTokPlayerFrameUrl(`https://www.tiktok.com/player/v1/${VIDEO_ID}/`, VIDEO_ID),
    true,
  )
  assert.equal(
    isTikTokPlayerFrameUrl(`https://www.tiktok.com.evil.test/player/v1/${VIDEO_ID}`, VIDEO_ID),
    false,
  )
  assert.equal(
    isTikTokPlayerFrameUrl(`http://www.tiktok.com/player/v1/${VIDEO_ID}`, VIDEO_ID),
    false,
  )
  assert.equal(
    isTikTokPlayerFrameUrl(`https://www.tiktok.com/player/v1/${VIDEO_ID}0`, VIDEO_ID),
    false,
  )
  assert.equal(
    isTikTokPlayerFrameUrl(`https://www.tiktok.com/player/v1/${VIDEO_ID}#unexpected`, VIDEO_ID),
    false,
  )
})

test('keeps the requested TikTok volume when the player confirms it', async () => {
  const scripts: string[] = []
  const frame = createFrame(async (script) => {
    scripts.push(script)
    return successfulResult(5, 7)
  })

  const result = await applyTikTokPlayerVolume(
    () => [frame],
    VIDEO_ID,
    5,
    7,
    { requestedDelays: [0], wait: noWait },
  )

  assert.deepEqual(result, {
    applied: true,
    effectiveVolume: 5,
    usedFallback: false,
  })
  assert.equal(scripts.length, 1)
})

test('uses 20 percent only after the requested volume cannot be confirmed', async () => {
  let callCount = 0
  const frame = createFrame(async () => {
    callCount += 1
    return callCount === 1
      ? { appliedCount: 0, generation: 4, mediaCount: 1, mutedCount: 1, volume: 0.05 }
      : successfulResult(20, 4)
  })

  const result = await applyTikTokPlayerVolume(
    () => [frame],
    VIDEO_ID,
    5,
    4,
    { requestedDelays: [0], wait: noWait },
  )

  assert.deepEqual(result, {
    applied: true,
    effectiveVolume: 20,
    usedFallback: true,
  })
  assert.equal(callCount, 2)
})

test('does not choose 20 percent only because the TikTok media is still missing', async () => {
  let callCount = 0
  const frame = createFrame(async () => {
    callCount += 1
    return {
      appliedCount: 0,
      generation: 6,
      mediaCount: 0,
      mutedCount: 0,
      volume: 0.05,
    }
  })

  const result = await applyTikTokPlayerVolume(
    () => [frame],
    VIDEO_ID,
    5,
    6,
    { requestedDelays: [0], wait: noWait },
  )

  assert.deepEqual(result, {
    applied: false,
    effectiveVolume: null,
    usedFallback: false,
  })
  assert.equal(callCount, 1)
})

test('never replaces an explicit zero volume with the 20 percent fallback', async () => {
  let callCount = 0
  const frame = createFrame(async () => {
    callCount += 1
    throw new Error('frame unavailable')
  })

  const result = await applyTikTokPlayerVolume(
    () => [frame],
    VIDEO_ID,
    0,
    3,
    { requestedDelays: [0], wait: noWait },
  )

  assert.deepEqual(result, {
    applied: false,
    effectiveVolume: null,
    usedFallback: false,
  })
  assert.equal(callCount, 1)
})

test('re-evaluates the iframe list while waiting for the TikTok player', async () => {
  let frameLookupCount = 0
  const frame = createFrame(async () => successfulResult(35, 9))

  const result = await applyTikTokPlayerVolume(
    () => {
      frameLookupCount += 1
      return frameLookupCount === 1 ? [] : [frame]
    },
    VIDEO_ID,
    35,
    9,
    { requestedDelays: [0, 1], wait: noWait },
  )

  assert.equal(result.applied, true)
  assert.equal(result.effectiveVolume, 35)
  assert.equal(frameLookupCount, 2)
})

test('rejects a confirmation belonging to a newer volume generation', async () => {
  const frame = createFrame(async () => successfulResult(60, 12))

  const result = await applyTikTokPlayerVolume(
    () => [frame],
    VIDEO_ID,
    5,
    11,
    { requestedDelays: [0], wait: noWait },
  )

  assert.deepEqual(result, {
    applied: false,
    effectiveVolume: null,
    usedFallback: false,
  })
})

test('returns safely when TikTok frame evaluation never settles', async () => {
  const frame = createFrame(() => new Promise(() => undefined))

  const result = await applyTikTokPlayerVolume(
    () => [frame],
    VIDEO_ID,
    5,
    13,
    { executeTimeoutMs: 1, requestedDelays: [0], wait: noWait },
  )

  assert.deepEqual(result, {
    applied: false,
    effectiveVolume: null,
    usedFallback: false,
  })
})
