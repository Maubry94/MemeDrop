import assert from 'node:assert/strict'
import test from 'node:test'
import { createFrameCoalescedSync } from './frameCoalescedSync.ts'

test('coalesces changes per frame and always writes the latest value', () => {
  let currentValue = 0
  let nextFrameId = 0
  const frames = new Map<number, () => void>()
  const cancelledFrames: number[] = []
  const writtenValues: number[] = []
  const sync = createFrameCoalescedSync({
    read: () => currentValue,
    write: (value) => {
      writtenValues.push(value)
    },
    requestFrame: (callback) => {
      const frameId = ++nextFrameId
      frames.set(frameId, callback)
      return frameId
    },
    cancelFrame: (frameId) => {
      cancelledFrames.push(frameId)
      frames.delete(frameId)
    },
  })

  currentValue = 10
  sync.schedule()
  currentValue = 20
  sync.schedule()

  assert.deepEqual(writtenValues, [])
  assert.equal(frames.size, 1)
  frames.get(1)?.()
  frames.delete(1)
  assert.deepEqual(writtenValues, [20])

  currentValue = 30
  sync.schedule()
  sync.flush()
  assert.deepEqual(writtenValues, [20, 30])
  assert.deepEqual(cancelledFrames, [2])
  assert.equal(frames.size, 0)
})

test('reports synchronous and asynchronous write failures', async () => {
  const errors: unknown[] = []
  const frame = { callback: null as (() => void) | null }
  let shouldRejectAsynchronously = false
  const sync = createFrameCoalescedSync({
    read: () => 1,
    write: () => {
      if (shouldRejectAsynchronously) {
        return Promise.reject(new Error('async failure'))
      }
      throw new Error('sync failure')
    },
    requestFrame: (nextCallback) => {
      frame.callback = nextCallback
      return 1
    },
    cancelFrame: () => undefined,
    onError: (error) => errors.push(error),
  })

  sync.schedule()
  assert.ok(frame.callback)
  frame.callback()
  assert.match(String(errors[0]), /sync failure/)

  shouldRejectAsynchronously = true
  sync.schedule()
  assert.ok(frame.callback)
  frame.callback()
  await Promise.resolve()
  assert.match(String(errors[1]), /async failure/)
})

test('keeps one write in flight and sends only the latest queued value', async () => {
  let currentValue = 1
  let nextFrameId = 0
  const frames = new Map<number, () => void>()
  const writtenValues: number[] = []
  const writeResolvers: Array<() => void> = []
  const sync = createFrameCoalescedSync({
    read: () => currentValue,
    write: (value) => {
      writtenValues.push(value)
      return new Promise<void>((resolve) => writeResolvers.push(resolve))
    },
    requestFrame: (callback) => {
      const frameId = ++nextFrameId
      frames.set(frameId, callback)
      return frameId
    },
    cancelFrame: (frameId) => {
      frames.delete(frameId)
    },
  })

  sync.schedule()
  frames.get(1)?.()
  frames.delete(1)
  assert.deepEqual(writtenValues, [1])

  currentValue = 2
  sync.schedule()
  currentValue = 3
  sync.schedule()
  assert.equal(frames.size, 0)
  assert.deepEqual(writtenValues, [1])

  writeResolvers.shift()?.()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(frames.size, 1)

  frames.get(2)?.()
  frames.delete(2)
  assert.deepEqual(writtenValues, [1, 3])
  writeResolvers.shift()?.()
  await Promise.resolve()
})

test('flushes the latest queued value as soon as an in-flight write completes', async () => {
  let currentValue = 1
  const frames = new Map<number, () => void>()
  const writtenValues: number[] = []
  const writeResolvers: Array<() => void> = []
  const sync = createFrameCoalescedSync({
    read: () => currentValue,
    write: (value) => {
      writtenValues.push(value)
      return new Promise<void>((resolve) => writeResolvers.push(resolve))
    },
    requestFrame: (callback) => {
      frames.set(1, callback)
      return 1
    },
    cancelFrame: (frameId) => {
      frames.delete(frameId)
    },
  })

  sync.schedule()
  frames.get(1)?.()
  frames.delete(1)
  currentValue = 2
  sync.schedule()
  sync.flush()

  assert.deepEqual(writtenValues, [1])
  writeResolvers.shift()?.()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(writtenValues, [1, 2])
  assert.equal(frames.size, 0)

  writeResolvers.shift()?.()
  await Promise.resolve()
})
