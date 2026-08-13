import assert from 'node:assert/strict'
import test from 'node:test'
import type { Drop } from '../shared/types.js'
import { createDropScheduler } from './dropScheduler.js'

const createDrop = (id: string, contentType = 'image/png'): Drop => ({
  id,
  url: `https://cdn.discordapp.com/${id}`,
  contentType,
  fileName: `${id}.png`,
  caption: null,
  authorId: 'owner',
  ownerId: 'owner',
  author: 'Owner',
  authorAvatarUrl: null,
  createdAt: new Date(0).toISOString(),
})

const silentLogger = {
  log: () => undefined,
  warn: () => undefined,
}

test('scheduler safety timeout clears a stalled target and advances the queue', async () => {
  const target = { id: 'target' }
  const delivered: string[] = []
  const cleared: string[] = []
  const scheduler = createDropScheduler({
    getEligibleTargets: () => [target],
    getTargetsByUserId: () => [target],
    sendDrop: (_target, drop) => delivered.push(drop.id),
    sendClear: (clearedTarget) => cleared.push(clearedTarget.id),
    imageSafetyTimeoutMs: 10,
    mediaSafetyTimeoutMs: 10,
    logger: silentLogger,
  })

  assert.equal(scheduler.enqueueDrop(createDrop('first')), 1)
  assert.equal(scheduler.enqueueDrop(createDrop('second')), 1)
  assert.deepEqual(delivered, ['first'])

  await new Promise((resolve) => setTimeout(resolve, 50))

  assert.deepEqual(cleared, ['target', 'target'])
  assert.deepEqual(delivered, ['first', 'second'])
})

test('scheduler bounds the global queue', () => {
  const target = { id: 'target' }
  const scheduler = createDropScheduler({
    getEligibleTargets: () => [target],
    getTargetsByUserId: () => [target],
    sendDrop: () => undefined,
    sendClear: () => undefined,
    logger: silentLogger,
  })

  assert.equal(scheduler.enqueueDrop(createDrop('active')), 1)
  for (let index = 0; index < 100; index += 1) {
    assert.equal(scheduler.enqueueDrop(createDrop(`queued-${index}`)), 1)
  }
  assert.equal(scheduler.enqueueDrop(createDrop('overflow')), 0)
})
