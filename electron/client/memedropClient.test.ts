import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type WebSocket from 'ws'
import {
  startMemeDropClient,
  type MemeDropClientRuntime,
} from './memedropClient.ts'
import type { ConnectionStatus, Drop } from '../../shared/types.ts'

type FakeTimer = {
  callback: () => void
  delayMs: number
  cleared: boolean
}

class FakeSocket extends EventEmitter {
  readyState = 0
  sent: string[] = []
  closeCount = 0
  terminateCount = 0
  sendError: Error | null = null

  open() {
    this.readyState = 1
    this.emit('open')
  }

  receive(payload: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(payload)), false)
  }

  remoteClose(code: number) {
    this.readyState = 3
    this.emit('close', code, Buffer.alloc(0))
  }

  fail(error = new Error('fake transport failure')) {
    this.emit('error', error)
  }

  send(data: string, callback?: (error?: Error) => void) {
    if (this.sendError) {
      throw this.sendError
    }
    this.sent.push(data)
    callback?.()
  }

  close() {
    this.closeCount += 1
    this.readyState = 3
    this.emit('close', 1000, Buffer.alloc(0))
  }

  terminate() {
    this.terminateCount += 1
    this.readyState = 3
    this.emit('close', 1006, Buffer.alloc(0))
  }
}

class FakeRuntime implements MemeDropClientRuntime {
  sockets: FakeSocket[] = []
  timers: FakeTimer[] = []

  createSocket = () => {
    const socket = new FakeSocket()
    this.sockets.push(socket)
    return socket as unknown as WebSocket
  }

  setTimer = (callback: () => void, delayMs: number) => {
    const timer: FakeTimer = { callback, delayMs, cleared: false }
    this.timers.push(timer)
    return timer as unknown as NodeJS.Timeout
  }

  clearTimer = (timer: NodeJS.Timeout) => {
    ;(timer as unknown as FakeTimer).cleared = true
  }

  latestTimer(delayMs: number) {
    for (let index = this.timers.length - 1; index >= 0; index -= 1) {
      const timer = this.timers[index]
      if (timer?.delayMs === delayMs) {
        return timer
      }
    }

    return undefined
  }

  activeTimers(delayMs: number) {
    return this.timers.filter((timer) => timer.delayMs === delayMs && !timer.cleared)
  }

  run(timer: FakeTimer | undefined) {
    assert.ok(timer)
    timer.cleared = true
    timer.callback()
  }
}

const createHarness = () => {
  const runtime = new FakeRuntime()
  const statuses: ConnectionStatus[] = []
  const drops: Drop[] = []
  let disconnected = 0
  let authenticationRejected = 0
  let cleared = 0

  const controller = startMemeDropClient(
    {
      serverUrl: 'http://127.0.0.1:3010',
      accessKey: 'test-key',
      authToken: 'test-token',
      appVersion: '3.0.7',
      dropsEnabled: true,
      onDrop: (drop) => drops.push(drop),
      onClearDrop: () => {
        cleared += 1
      },
      onConnectedUsers: () => undefined,
      onDisconnected: () => {
        disconnected += 1
      },
      onStatus: (status) => statuses.push(status),
      onAuthenticationRejected: () => {
        authenticationRejected += 1
      },
    },
    runtime,
  )

  return {
    runtime,
    controller,
    statuses,
    drops,
    get disconnected() {
      return disconnected
    },
    get authenticationRejected() {
      return authenticationRejected
    },
    get cleared() {
      return cleared
    },
  }
}

const parseSentMessages = (socket: FakeSocket) =>
  socket.sent.map((message) => JSON.parse(message) as Record<string, unknown>)

test('a stale heartbeat cannot terminate or reconnect a newer socket', () => {
  const harness = createHarness()
  const firstSocket = harness.runtime.sockets[0]
  assert.ok(firstSocket)

  firstSocket.open()
  firstSocket.receive({ type: 'hello' })
  const staleHeartbeat = harness.runtime.latestTimer(75_000)

  firstSocket.remoteClose(1006)
  harness.runtime.run(harness.runtime.latestTimer(3_000))

  const secondSocket = harness.runtime.sockets[1]
  assert.ok(secondSocket)
  secondSocket.open()
  secondSocket.receive({ type: 'hello' })

  harness.runtime.run(staleHeartbeat)

  assert.equal(secondSocket.terminateCount, 0)
  assert.equal(harness.runtime.sockets.length, 2)
  assert.equal(harness.runtime.activeTimers(3_000).length, 0)
  assert.equal(harness.disconnected, 1)
})

test('a reconnect callback that was already queued becomes inert after stop', () => {
  const harness = createHarness()
  const socket = harness.runtime.sockets[0]
  assert.ok(socket)

  socket.remoteClose(1006)
  const queuedReconnect = harness.runtime.latestTimer(3_000)
  harness.controller.stop()
  harness.runtime.run(queuedReconnect)

  assert.equal(harness.runtime.sockets.length, 1)
  assert.equal(harness.runtime.activeTimers(3_000).length, 0)
})

test('an acknowledgement attempted while disconnected returns false', () => {
  const harness = createHarness()
  const socket = harness.runtime.sockets[0]
  assert.ok(socket)

  socket.open()
  socket.receive({ type: 'hello' })
  assert.equal(harness.controller.completeDrop('drop-connected'), true)

  socket.remoteClose(1006)
  assert.equal(harness.controller.completeDrop('drop-disconnected'), false)
  assert.deepEqual(parseSentMessages(socket), [
    { type: 'client-state', dropsEnabled: true },
    { type: 'drop-completed', dropId: 'drop-connected' },
  ])
})

test('a synchronous socket send failure returns false and retires the connection', () => {
  const harness = createHarness()
  const socket = harness.runtime.sockets[0]
  assert.ok(socket)

  socket.open()
  socket.receive({ type: 'hello' })
  socket.sendError = new Error('send failed synchronously')

  assert.equal(harness.controller.completeDrop('drop-not-sent'), false)
  assert.equal(socket.terminateCount, 1)
  assert.equal(harness.disconnected, 1)
  assert.equal(harness.runtime.activeTimers(3_000).length, 1)
  assert.deepEqual(parseSentMessages(socket), [
    { type: 'client-state', dropsEnabled: true },
  ])
})

test('4001 and 1008 are terminal and only 4001 revokes authentication', async (context) => {
  for (const closeCode of [4001, 1008]) {
    await context.test(`close ${closeCode}`, () => {
      const harness = createHarness()
      const socket = harness.runtime.sockets[0]
      assert.ok(socket)

      socket.open()
      socket.receive({ type: 'hello' })
      socket.remoteClose(closeCode)

      assert.equal(harness.disconnected, 1)
      assert.equal(harness.authenticationRejected, closeCode === 4001 ? 1 : 0)
      assert.equal(harness.runtime.activeTimers(3_000).length, 0)
      assert.equal(
        harness.statuses[harness.statuses.length - 1]?.message,
        closeCode === 4001
          ? 'Serveur MemeDrop : session Discord expirée, reconnecte-toi.'
          : 'Serveur MemeDrop : connexion refusée. Vérifie la clé du serveur.',
      )
    })
  }
})

test('the latest client state and active drop are replayed once after reconnect', () => {
  const harness = createHarness()
  const firstSocket = harness.runtime.sockets[0]
  assert.ok(firstSocket)

  firstSocket.open()
  assert.equal(harness.controller.updateDropsEnabled(false), false)
  firstSocket.receive({ type: 'hello' })
  firstSocket.receive({
    type: 'active-drop',
    drop: { id: 'drop-1', url: 'https://example.test/drop' },
  })

  firstSocket.fail()
  firstSocket.remoteClose(1006)
  assert.equal(harness.runtime.activeTimers(3_000).length, 1)
  harness.runtime.run(harness.runtime.latestTimer(3_000))

  const secondSocket = harness.runtime.sockets[1]
  assert.ok(secondSocket)
  secondSocket.open()
  secondSocket.receive({ type: 'hello' })
  secondSocket.receive({
    type: 'active-drop',
    drop: { id: 'drop-1', url: 'https://example.test/drop' },
  })

  assert.deepEqual(parseSentMessages(firstSocket), [
    { type: 'client-state', dropsEnabled: false },
  ])
  assert.deepEqual(parseSentMessages(secondSocket), [
    { type: 'client-state', dropsEnabled: false },
  ])
  assert.deepEqual(harness.drops.map((drop) => drop.id), ['drop-1', 'drop-1'])
  assert.equal(harness.disconnected, 1)
  assert.equal(harness.cleared, 0)
})
