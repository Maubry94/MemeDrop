import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { computed, createRenderer } from 'vue'
import type { Drop, DropCompletionReason } from '../../shared/types.ts'
import { useActiveDrop } from './useActiveDrop.ts'

const createDrop = (id: string): Drop => ({
  id,
  url: `https://cdn.discordapp.com/${id}.mp4`,
  contentType: 'video/mp4',
  fileName: `${id}.mp4`,
  caption: null,
  authorId: 'other-user',
  author: 'Viewer',
  authorAvatarUrl: null,
  createdAt: new Date(0).toISOString(),
})

const createHarness = (context: TestContext) => {
  const completions: Array<{ id: string; reason?: DropCompletionReason }> = []
  const state = { accepted: false, drop: createDrop('first') }
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      memedropOverlay: {
        completeCurrentDrop: async (id: string, reason?: DropCompletionReason) => {
          completions.push({ id, reason })
          return state.accepted
        },
        getActiveDropSnapshot: async () => ({
          serverDrop: state.drop,
          serverDropPresented: true,
          testDrop: null,
        }),
      },
    },
  })

  // Mount the real composable so lifecycle cleanup is exercised, without a DOM
  // or Electron window. The component itself renders only a comment node.
  const renderer = createRenderer<object, object>({
    patchProp: () => undefined,
    insert: () => undefined,
    remove: () => undefined,
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText: () => undefined,
    setElementText: () => undefined,
    parentNode: () => null,
    nextSibling: () => null,
  })
  let drops!: ReturnType<typeof useActiveDrop>
  const app = renderer.createApp({
    setup() {
      drops = useActiveDrop({
        isOverlayView: computed(() => true),
        dropsEnabled: computed(() => true),
        hideOwnDrops: computed(() => false),
        serverConfig: computed(() => ({
          serverUrl: 'http://127.0.0.1:3010',
          accessKey: 'test',
          discordUserId: 'viewer',
          discordUserName: 'Viewer',
          discordUserAvatarUrl: null,
        })),
      })
      return () => null
    },
  })
  app.mount({})
  context.after(() => {
    app.unmount()
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  })
  drops.receiveDrop(state.drop)
  return { drops, state, completions }
}

for (const reason of ['ended', 'skipped', 'error', 'timeout'] as const) {
  test(`renderer preserves ${reason} on automatic completion retry`, async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] })
    const { drops, state, completions } = createHarness(context)
    assert.equal(await drops.completeActiveDrop('first', reason), false)
    assert.equal(drops.activeDrop.value?.id, 'first')

    state.accepted = true
    context.mock.timers.tick(2000)
    await setImmediate()
    assert.deepEqual(completions, [
      { id: 'first', reason }, { id: 'first', reason },
    ])
    assert.equal(drops.activeDrop.value, null)
  })
}

test('a later ended event cannot promote a failed local completion to a group ending', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const { drops, state, completions } = createHarness(context)
  await drops.completeActiveDrop('first', 'error')
  state.accepted = true
  await drops.completeActiveDrop('first', 'ended')
  assert.deepEqual(completions, [
    { id: 'first', reason: 'error' }, { id: 'first', reason: 'error' },
  ])
  context.mock.timers.tick(2000)
  await setImmediate()
  assert.equal(completions.length, 2)
})

test('a group transition cancels the old completion retry and keeps the next reason separate', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const { drops, state, completions } = createHarness(context)
  await drops.completeActiveDrop('first', 'ended')
  drops.clearServerDrop()
  state.drop = createDrop('second')
  drops.receiveDrop(state.drop)
  context.mock.timers.tick(2000)
  await setImmediate()
  assert.deepEqual(completions, [{ id: 'first', reason: 'ended' }])
  assert.equal(drops.activeDrop.value?.id, 'second')

  state.accepted = true
  await drops.completeActiveDrop('second', 'timeout')
  assert.deepEqual(completions[1], { id: 'second', reason: 'timeout' })
})

test('retrying a manual skip reports skipped instead of a natural ending', async (context) => {
  const { drops, state, completions } = createHarness(context)
  state.accepted = true
  drops.retryServerDropCompletion('first')
  await setImmediate()
  assert.deepEqual(completions, [{ id: 'first', reason: 'skipped' }])
})
