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

test('normal completion clears every target once before advancing the queue', () => {
  const firstTarget = { id: 'first-target' }
  const secondTarget = { id: 'second-target' }
  const events: string[] = []
  const scheduler = createDropScheduler({
    getEligibleTargets: () => [firstTarget, secondTarget],
    getTargetsByUserId: () => [firstTarget, secondTarget],
    sendDrop: (target, drop) => events.push(`drop:${drop.id}:${target.id}`),
    sendClear: (target) => events.push(`clear:${target.id}`),
    logger: silentLogger,
  })

  scheduler.enqueueDrop(createDrop('first'))
  scheduler.enqueueDrop(createDrop('second'))
  assert.deepEqual(events, [
    'drop:first:first-target',
    'drop:first:second-target',
  ])

  scheduler.completeDropForTarget(firstTarget, 'first')
  assert.deepEqual(events, [
    'drop:first:first-target',
    'drop:first:second-target',
  ])

  scheduler.completeDropForTarget(secondTarget, 'first')
  assert.deepEqual(events, [
    'drop:first:first-target',
    'drop:first:second-target',
    'clear:first-target',
    'clear:second-target',
    'drop:second:first-target',
    'drop:second:second-target',
  ])

  scheduler.completeDropForTarget(secondTarget, 'first')
  assert.equal(events.filter((event) => event.startsWith('clear:')).length, 2)
})

test('disconnecting the last pending target notifies targets that already acknowledged', () => {
  const completedTarget = { id: 'completed-target' }
  const disconnectedTarget = { id: 'disconnected-target' }
  const cleared: string[] = []
  const scheduler = createDropScheduler({
    getEligibleTargets: () => [completedTarget, disconnectedTarget],
    getTargetsByUserId: () => [completedTarget, disconnectedTarget],
    sendDrop: () => undefined,
    sendClear: (target) => cleared.push(target.id),
    logger: silentLogger,
  })

  scheduler.enqueueDrop(createDrop('drop'))
  scheduler.completeDropForTarget(completedTarget, 'drop')
  scheduler.removeTarget(disconnectedTarget)

  assert.deepEqual(cleared, ['completed-target'])
})
