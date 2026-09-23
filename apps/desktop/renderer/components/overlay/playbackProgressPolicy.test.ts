import assert from 'node:assert/strict'
import test from 'node:test'
import { getPlaybackProgressAction } from './playbackProgressPolicy.ts'

test('distinguishes normal progress, insignificant updates and backwards seeks', () => {
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 0,
    durationSeconds: 20,
    previousTimeSeconds: null,
  }), 'ignored')
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 4,
    durationSeconds: 20,
    previousTimeSeconds: 3.5,
  }), 'progressed')
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 8,
    durationSeconds: 20,
    previousTimeSeconds: 12,
  }), 'rewound')
})

test('closely spaced samples accumulate against the last significant baseline', () => {
  let baseline: number | null = null
  const actions = [0, 0.02, 0.04, 0.06].map((currentTimeSeconds) => {
    const action = getPlaybackProgressAction({
      currentTimeSeconds,
      durationSeconds: 20,
      previousTimeSeconds: baseline,
    })
    if (action !== 'ignored') {
      baseline = currentTimeSeconds
    }
    return action
  })

  assert.deepEqual(actions, ['ignored', 'ignored', 'ignored', 'progressed'])
  assert.equal(baseline, 0.06)
})

test('finishes at the reported duration or when a player loops from its known end', () => {
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 19.85,
    durationSeconds: 20,
    previousTimeSeconds: 19.5,
  }), 'ended')
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 0.1,
    durationSeconds: 20,
    previousTimeSeconds: 19.8,
  }), 'ended')
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 0,
    durationSeconds: null,
    previousTimeSeconds: 12,
  }), 'restarted')
})

test('distinguishes an ordinary backwards correction from a suspicious restart', () => {
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 20,
    durationSeconds: 120,
    previousTimeSeconds: 80,
  }), 'rewound')
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 0.5,
    durationSeconds: 120,
    previousTimeSeconds: 20,
  }), 'restarted')
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 0,
    durationSeconds: 120,
    previousTimeSeconds: 2,
  }), 'restarted')
})

test('can rely on the ended event for live players while still detecting a loop', () => {
  assert.equal(getPlaybackProgressAction({
    completeAtDuration: false,
    currentTimeSeconds: 120,
    durationSeconds: 120,
    previousTimeSeconds: 119,
  }), 'progressed')
  assert.equal(getPlaybackProgressAction({
    completeAtDuration: false,
    currentTimeSeconds: 0,
    durationSeconds: 120,
    previousTimeSeconds: 119.5,
  }), 'ended')
})

test('handles very short media without requiring a long rewind', () => {
  assert.equal(getPlaybackProgressAction({
    currentTimeSeconds: 0,
    durationSeconds: 0.8,
    previousTimeSeconds: 0.7,
  }), 'ended')
})
