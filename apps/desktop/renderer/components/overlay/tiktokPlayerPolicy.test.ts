import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getTikTokImageProgressAction,
  getTikTokPlaybackStateAction,
  getTikTokVolumeRetryDelay,
  shouldRequestTikTokPlayback,
  TIKTOK_AUTOPLAY_VALUE,
  TIKTOK_START_COMMANDS,
} from './tiktokPlayerPolicy.ts'

test('starts TikTok muted without waiting for the ready message', () => {
  assert.equal(TIKTOK_AUTOPLAY_VALUE, '1')
  assert.deepEqual(TIKTOK_START_COMMANDS, ['mute', 'play'])
  assert.equal(shouldRequestTikTokPlayback(false), true)
  assert.equal(shouldRequestTikTokPlayback(true), false)
})

test('ignores an initial ended state before TikTok has started', () => {
  assert.equal(getTikTokPlaybackStateAction(0, false), 'ignore')
})

test('recognizes playback start and a genuine end', () => {
  assert.equal(getTikTokPlaybackStateAction(1, false), 'started')
  assert.equal(getTikTokPlaybackStateAction(0, true), 'ended')
})

test('backs off TikTok volume retries without ever giving up during playback', () => {
  assert.equal(getTikTokVolumeRetryDelay(0), 100)
  assert.equal(getTikTokVolumeRetryDelay(2), 500)
  assert.equal(getTikTokVolumeRetryDelay(10), 2_000)
  assert.equal(getTikTokVolumeRetryDelay(-1), 100)
})

test('finishes a TikTok carousel when it wraps back to an earlier image', () => {
  assert.equal(getTikTokImageProgressAction({
    currentIndex: 2,
    playbackStarted: true,
    previousIndex: 1,
  }), 'progressed')
  assert.equal(getTikTokImageProgressAction({
    currentIndex: 0,
    playbackStarted: true,
    previousIndex: 3,
  }), 'ended')
  assert.equal(getTikTokImageProgressAction({
    currentIndex: 0,
    playbackStarted: false,
    previousIndex: 2,
  }), 'progressed')
})
