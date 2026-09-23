import assert from 'node:assert/strict'
import test from 'node:test'
import type { Drop, DropCompletionReason } from '@memedrop/protocol'
import { createDropScheduler } from './dropScheduler.js'

type Target = { id: string; userId?: string }

const createDrop = (
  id: string,
  contentType = 'video/mp4',
  overrides: Partial<Drop> = {},
): Drop => ({
  id,
  url: `https://cdn.discordapp.com/${id}`,
  contentType,
  fileName: `${id}.mp4`,
  caption: null,
  authorId: 'owner',
  ownerId: 'owner',
  author: 'Owner',
  authorAvatarUrl: null,
  createdAt: new Date(0).toISOString(),
  ...overrides,
})

const createHarness = (
  targets: Target[],
  options: {
    imageSafetyTimeoutMs?: number
    mediaSafetyTimeoutMs?: number
    completionGraceMs?: number
    sendDrop?: (target: Target, drop: Drop) => void
    sendClear?: (target: Target) => void
  } = {},
) => {
  const state = { targets }
  const events: string[] = []
  const delivered = new Map<Target, string[]>()
  const logs: string[] = []
  const scheduler = createDropScheduler<Target>({
    ...options,
    getEligibleTargets: () => state.targets,
    getTargetsByUserId: (userId) =>
      state.targets.filter((target) => target.userId === userId),
    sendDrop: (target, drop) => {
      options.sendDrop?.(target, drop)
      events.push(`drop:${target.id}:${drop.id}`)
      const drops = delivered.get(target) ?? []
      drops.push(drop.id)
      delivered.set(target, drops)
    },
    sendClear: (target) => {
      options.sendClear?.(target)
      events.push(`clear:${target.id}`)
    },
    logger: {
      log: (message) => logs.push(String(message)),
      warn: (message) => logs.push(String(message)),
    },
  })
  return {
    ...scheduler,
    state,
    events,
    logs,
    drops: (target: Target) => delivered.get(target) ?? [],
  }
}

test('seven clients wait together and catch up the silent viewer after normal completion', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const targets = Array.from({ length: 7 }, (_, index) => ({ id: `target-${index}` }))
  const harness = createHarness(targets)
  assert.equal(harness.enqueueDrop(createDrop('first')), 7)
  assert.equal(harness.enqueueDrop(createDrop('second')), 7)

  for (const target of targets.slice(0, 6)) {
    harness.completeDropForTarget(target, 'first', 'ended')
  }
  t.mock.timers.tick(2999)
  for (const target of targets) {
    assert.deepEqual(harness.drops(target), ['first'])
  }
  assert.equal(harness.events.filter((event) => event.startsWith('clear:')).length, 0)

  t.mock.timers.tick(1)
  for (const target of targets) {
    assert.deepEqual(harness.drops(target), ['first', 'second'])
  }
  assert.deepEqual(harness.events.slice(7, 14), targets.map((target) => `clear:${target.id}`))
  assert.ok(harness.logs.some((message) => message.includes('rattrapage collectif')))
})

test('all clients finishing advances together immediately and cancels the old grace timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const alice = { id: 'alice' }
  const bob = { id: 'bob' }
  const harness = createHarness([alice, bob])
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('second'))
  harness.completeDropForTarget(alice, 'first', 'ended')
  t.mock.timers.tick(500)
  harness.completeDropForTarget(bob, 'first', 'ended')

  assert.deepEqual(harness.events, [
    'drop:alice:first', 'drop:bob:first',
    'clear:alice', 'clear:bob',
    'drop:alice:second', 'drop:bob:second',
  ])
  const eventCount = harness.events.length
  t.mock.timers.tick(3000)
  assert.equal(harness.events.length, eventCount)
})

for (const reason of ['skipped', 'error', 'timeout', undefined] as const) {
  test(`an early ${reason ?? 'legacy'} acknowledgement never cuts off the other viewers`, (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const alice = { id: 'alice' }
    const bob = { id: 'bob' }
    const harness = createHarness([alice, bob])
    harness.enqueueDrop(createDrop('first'))
    harness.enqueueDrop(createDrop('second'))
    harness.completeDropForTarget(alice, 'first', reason)
    // Even a conflicting duplicate must not promote a skip to a normal ending.
    harness.completeDropForTarget(alice, 'first', 'ended')
    t.mock.timers.tick(20_000)
    assert.deepEqual(harness.events, ['drop:alice:first', 'drop:bob:first'])

    harness.completeDropForTarget(bob, 'first', 'ended')
    assert.deepEqual(harness.drops(alice), ['first', 'second'])
    assert.deepEqual(harness.drops(bob), ['first', 'second'])
  })
}

test('stale and unrelated acknowledgements cannot clear or finish the current group', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const alice = { id: 'alice' }
  const bob = { id: 'bob' }
  const harness = createHarness([alice, bob])
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('second'))
  harness.enqueueDrop(createDrop('third'))
  harness.completeDropForTarget(alice, 'first', 'ended')
  harness.completeDropForTarget(bob, 'first', 'ended')
  const eventCount = harness.events.length

  harness.completeDropForTarget(alice, 'first', 'ended')
  harness.completeDropForTarget({ id: 'unrelated' }, 'second', 'ended')
  harness.completeDropForTarget(bob, 'third', 'ended')
  t.mock.timers.tick(3000)
  assert.equal(harness.events.length, eventCount)
  assert.deepEqual(harness.drops(alice), ['first', 'second'])
})

test('a reconnect waits for the next collective drop without replaying or racing ahead', () => {
  const oldAlice = { id: 'old-alice', userId: 'alice' }
  const alice = { id: 'alice', userId: 'alice' }
  const bob = { id: 'bob', userId: 'bob' }
  const harness = createHarness([oldAlice, bob])
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('second'))
  harness.state.targets = [alice, bob]
  harness.replaceTarget(oldAlice, alice)
  assert.deepEqual(harness.drops(alice), [])
  assert.deepEqual(harness.drops(bob), ['first'])

  harness.completeDropForTarget(oldAlice, 'first', 'ended')
  assert.deepEqual(harness.drops(alice), [])
  harness.completeDropForTarget(bob, 'first', 'ended')
  assert.deepEqual(harness.drops(alice), ['second'])
  assert.deepEqual(harness.drops(bob), ['first', 'second'])
  assert.deepEqual(harness.drops(oldAlice), ['first'])
})

test('a newly ready client joins the queued next drop, never the active one', () => {
  const alice = { id: 'alice' }
  const bob = { id: 'bob' }
  const newcomer = { id: 'newcomer' }
  const harness = createHarness([alice, bob])
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('second'))
  harness.state.targets.push(newcomer)
  harness.scheduleDrops()
  assert.deepEqual(harness.drops(newcomer), [])
  harness.completeDropForTarget(alice, 'first', 'ended')
  assert.deepEqual(harness.drops(newcomer), [])
  harness.completeDropForTarget(bob, 'first', 'ended')
  for (const target of [alice, bob]) {
    assert.deepEqual(harness.drops(target), ['first', 'second'])
  }
  assert.deepEqual(harness.drops(newcomer), ['second'])
})

test('a fully disconnected client rejoins the next queued collective drop after returning', () => {
  const oldAlice = { id: 'old-alice', userId: 'alice' }
  const alice = { id: 'alice', userId: 'alice' }
  const bob = { id: 'bob', userId: 'bob' }
  const harness = createHarness([oldAlice, bob])
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('second'))
  harness.state.targets = [bob]
  harness.removeTarget(oldAlice)
  harness.state.targets.push(alice)
  harness.scheduleDrops()
  assert.deepEqual(harness.drops(alice), [])
  harness.completeDropForTarget(bob, 'first', 'ended')
  assert.deepEqual(harness.drops(alice), ['second'])
  assert.deepEqual(harness.drops(bob), ['first', 'second'])
})

test('a newcomer targeted drop waits for the active global drop even without overlapping recipients', () => {
  const bob = { id: 'bob', userId: 'bob' }
  const alice = { id: 'alice', userId: 'alice' }
  const harness = createHarness([bob])
  harness.enqueueDrop(createDrop('global'))
  harness.state.targets.push(alice)
  harness.scheduleDrops()
  assert.equal(harness.enqueueDrop(createDrop('alice-only', 'video/mp4', {
    targetUserId: 'alice',
    ownerId: 'alice',
  })), 1)
  assert.deepEqual(harness.drops(alice), [])
  assert.deepEqual(harness.drops(bob), ['global'])

  harness.completeDropForTarget(bob, 'global', 'ended')
  assert.deepEqual(harness.drops(alice), ['alice-only'])
  assert.deepEqual(harness.events, [
    'drop:bob:global', 'clear:bob', 'drop:alice:alice-only',
  ])
})

test('twenty mixed drops with varying completion order never accumulate inter-client drift', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const targets = Array.from({ length: 7 }, (_, index) => ({ id: `target-${index}` }))
  const harness = createHarness(targets)
  const mediaTypes = ['image/png', 'video/mp4', 'audio/mpeg', 'text/html', 'text/html']
  for (let index = 0; index < 20; index += 1) {
    const family = index % mediaTypes.length
    harness.enqueueDrop(createDrop(`drop-${index}`, mediaTypes[family], {
      ...(family === 3 ? { youtubeVideoId: 'youtube-video' } : {}),
      ...(family === 4 ? { tiktokVideoId: '1234567890' } : {}),
    }))
  }
  for (let index = 0; index < 20; index += 1) {
    const completionOrder = [
      ...targets.slice(index % targets.length),
      ...targets.slice(0, index % targets.length),
    ]
    for (const target of completionOrder.slice(0, -1)) {
      harness.completeDropForTarget(target, `drop-${index}`, 'ended')
      t.mock.timers.tick(100)
      for (const receiver of targets) {
        assert.equal(harness.drops(receiver).length, index + 1)
        assert.equal(harness.drops(receiver).at(-1), `drop-${index}`)
      }
    }
    const last = completionOrder.at(-1)
    assert.ok(last)
    harness.completeDropForTarget(last, `drop-${index}`, 'ended')
    for (const target of targets) {
      assert.equal(harness.drops(target).length, Math.min(index + 2, 20))
    }
  }
  for (const target of targets) {
    assert.deepEqual(harness.drops(target), Array.from({ length: 20 }, (_, index) => `drop-${index}`))
  }
})

test('global and targeted drops preserve collective FIFO for overlapping recipients', () => {
  const alice = { id: 'alice', userId: 'alice' }
  const owner = { id: 'owner', userId: 'owner' }
  const bob = { id: 'bob', userId: 'bob' }
  const targets = [alice, owner, bob]
  const harness = createHarness(targets)
  harness.enqueueDrop(createDrop('global-first'))
  assert.equal(harness.enqueueDrop(createDrop('targeted', 'video/mp4', {
    targetUserId: 'alice',
  })), 1)
  harness.enqueueDrop(createDrop('global-second'))

  harness.completeDropForTarget(bob, 'global-first', 'ended')
  assert.deepEqual(harness.drops(bob), ['global-first'])
  harness.completeDropForTarget(alice, 'global-first', 'ended')
  harness.completeDropForTarget(owner, 'global-first', 'ended')
  assert.deepEqual(harness.drops(alice), ['global-first', 'targeted'])
  assert.deepEqual(harness.drops(owner), ['global-first', 'targeted'])
  assert.deepEqual(harness.drops(bob), ['global-first'])

  harness.completeDropForTarget(alice, 'targeted', 'ended')
  assert.deepEqual(harness.drops(bob), ['global-first'])
  harness.completeDropForTarget(owner, 'targeted', 'ended')
  assert.deepEqual(harness.drops(bob), ['global-first', 'global-second'])
  assert.deepEqual(harness.drops(alice), ['global-first', 'targeted', 'global-second'])
})

test('disjoint targeted groups can run together but cannot overtake an overlapping queued global drop', () => {
  const alice = { id: 'alice', userId: 'alice' }
  const bob = { id: 'bob', userId: 'bob' }
  const charlie = { id: 'charlie', userId: 'charlie' }
  const harness = createHarness([alice, bob, charlie])
  const targeted = (id: string, targetUserId: string) =>
    createDrop(id, 'video/mp4', { targetUserId, ownerId: targetUserId })
  harness.enqueueDrop(targeted('alice-only', 'alice'))
  harness.enqueueDrop(targeted('bob-only', 'bob'))
  harness.enqueueDrop(createDrop('global'))
  harness.enqueueDrop(targeted('charlie-only', 'charlie'))
  assert.deepEqual(harness.drops(alice), ['alice-only'])
  assert.deepEqual(harness.drops(bob), ['bob-only'])
  assert.deepEqual(harness.drops(charlie), [])

  harness.completeDropForTarget(alice, 'alice-only', 'ended')
  assert.deepEqual(harness.drops(alice), ['alice-only'])
  harness.completeDropForTarget(bob, 'bob-only', 'ended')
  assert.deepEqual(harness.drops(charlie), ['global'])
  for (const target of [alice, bob, charlie]) {
    harness.completeDropForTarget(target, 'global', 'ended')
  }
  assert.deepEqual(harness.drops(charlie), ['global', 'charlie-only'])
})

test('the owner can still stop a collective drop after locally completing it', () => {
  const owner = { id: 'owner' }
  const bob = { id: 'bob' }
  const harness = createHarness([owner, bob])
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('second'))
  harness.completeDropForTarget(owner, 'first', 'skipped')
  assert.deepEqual(harness.events, ['drop:owner:first', 'drop:bob:first'])
  assert.equal(harness.stopDropByOwner('first', 'owner'), true)
  assert.deepEqual(harness.events, [
    'drop:owner:first', 'drop:bob:first',
    'clear:owner', 'clear:bob',
    'drop:owner:second', 'drop:bob:second',
  ])
  harness.completeDropForTarget(bob, 'first', 'ended')
  assert.equal(harness.events.length, 6)
})

test('stopping a queued drop preserves active drops and checks ownership', () => {
  const alice = { id: 'alice' }
  const harness = createHarness([alice])
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('second'))
  harness.enqueueDrop(createDrop('third'))
  assert.equal(harness.stopDropByOwner('first', 'intruder'), false)
  assert.equal(harness.stopDropByOwner('second', 'intruder'), false)
  assert.equal(harness.stopDropByOwner('second', 'owner'), true)
  assert.deepEqual(harness.events, ['drop:alice:first'])
  harness.completeDropForTarget(alice, 'first', 'ended')
  assert.deepEqual(harness.drops(alice), ['first', 'third'])
})

test('removing a recipient releases only its reservation and excludes it from later launches', () => {
  const alice = { id: 'alice' }
  const bob = { id: 'bob' }
  const harness = createHarness([alice, bob])
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('second'))
  harness.state.targets = [alice]
  harness.removeTarget(bob)
  assert.deepEqual(harness.drops(alice), ['first'])
  harness.completeDropForTarget(alice, 'first', 'ended')
  assert.deepEqual(harness.events, [
    'drop:alice:first', 'drop:bob:first', 'clear:alice', 'drop:alice:second',
  ])
  harness.removeTarget(bob)
  assert.equal(harness.events.length, 4)
})

test('a queued targeted drop is discarded if its recipient leaves, even when the owner remains', () => {
  const alice = { id: 'alice', userId: 'alice' }
  const owner = { id: 'owner', userId: 'owner' }
  const harness = createHarness([alice, owner])
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('targeted', 'video/mp4', { targetUserId: 'alice' }))
  harness.enqueueDrop(createDrop('last'))
  harness.state.targets = [owner]
  harness.removeTarget(alice)
  harness.completeDropForTarget(owner, 'first', 'ended')
  assert.deepEqual(harness.drops(owner), ['first', 'last'])
})

test('absolute safety timeouts clear the whole stalled group and start the next group together', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const alice = { id: 'alice' }
  const bob = { id: 'bob' }
  const harness = createHarness([alice, bob], {
    imageSafetyTimeoutMs: 100,
    mediaSafetyTimeoutMs: 200,
  })
  harness.enqueueDrop(createDrop('image', 'image/png'))
  harness.enqueueDrop(createDrop('video'))
  harness.enqueueDrop(createDrop('last'))
  t.mock.timers.tick(99)
  assert.deepEqual(harness.drops(alice), ['image'])
  t.mock.timers.tick(1)
  for (const target of [alice, bob]) {
    assert.deepEqual(harness.drops(target), ['image', 'video'])
  }
  t.mock.timers.tick(199)
  assert.deepEqual(harness.drops(bob), ['image', 'video'])
  t.mock.timers.tick(1)
  for (const target of [alice, bob]) {
    assert.deepEqual(harness.drops(target), ['image', 'video', 'last'])
  }
})

test('global and targeted queue limits remain bounded', () => {
  const alice = { id: 'alice', userId: 'alice' }
  const harness = createHarness([alice])
  assert.equal(harness.enqueueDrop(createDrop('active')), 1)
  for (let index = 0; index < 100; index += 1) {
    assert.equal(harness.enqueueDrop(createDrop(`global-${index}`)), 1)
  }
  assert.equal(harness.enqueueDrop(createDrop('global-overflow')), 0)
  for (let index = 0; index < 25; index += 1) {
    assert.equal(harness.enqueueDrop(createDrop(`targeted-${index}`, 'video/mp4', {
      targetUserId: 'alice',
    })), 1)
  }
  assert.equal(harness.enqueueDrop(createDrop('targeted-overflow', 'video/mp4', {
    targetUserId: 'alice',
  })), 0)
})

test('failed sends and clears cannot block healthy recipients or break collective advancement', () => {
  const failed = { id: 'failed' }
  const healthy = { id: 'healthy' }
  const harness = createHarness([failed, healthy], {
    sendDrop: (target) => {
      if (target === failed) {
        throw new Error('closed')
      }
    },
    sendClear: (target) => {
      if (target === failed) {
        throw new Error('closed')
      }
    },
  })
  harness.enqueueDrop(createDrop('first'))
  harness.enqueueDrop(createDrop('second'))
  assert.deepEqual(harness.drops(healthy), ['first'])
  harness.completeDropForTarget(healthy, 'first', 'ended')
  assert.deepEqual(harness.drops(healthy), ['first', 'second'])
})

test('all completion reasons release a single-viewer group immediately', () => {
  for (const reason of ['ended', 'skipped', 'error', 'timeout', undefined] as (DropCompletionReason | undefined)[]) {
    const target = { id: 'target' }
    const harness = createHarness([target])
    harness.enqueueDrop(createDrop('first'))
    harness.enqueueDrop(createDrop('second'))
    harness.completeDropForTarget(target, 'first', reason)
    assert.deepEqual(harness.drops(target), ['first', 'second'])
  }
})
