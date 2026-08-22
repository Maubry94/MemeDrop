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

  remoteClose(code: number, reason = '') {
    this.readyState = 3
    this.emit('close', code, Buffer.from(reason))
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

const createHarness = ({
  serverUrl = 'http://127.0.0.1:3010',
  authToken = 'test-token',
}: { serverUrl?: string; authToken?: string } = {}) => {
  const runtime = new FakeRuntime()
  const statuses: ConnectionStatus[] = []
  const drops: Drop[] = []
  let disconnected = 0
  let authenticationRejected = 0
  let cleared = 0

  const controller = startMemeDropClient(
    {
      serverUrl,
      accessKey: 'test-key',
      authToken,
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

test('missing server or Discord configuration is an offline state, not an error', async (context) => {
  await context.test('server URL missing', () => {
    const harness = createHarness({ serverUrl: '' })

    assert.equal(harness.statuses.at(-1)?.state, 'configuration-required')
    assert.equal(harness.statuses.at(-1)?.reason, 'server-not-configured')
    assert.equal(harness.statuses.at(-1)?.level, 'info')
    assert.equal(harness.runtime.sockets.length, 0)
  })

  await context.test('Discord authentication missing', () => {
    const harness = createHarness({ authToken: '' })

    assert.equal(harness.statuses.at(-1)?.state, 'authentication-required')
    assert.equal(harness.statuses.at(-1)?.reason, 'discord-required')
    assert.equal(harness.statuses.at(-1)?.level, 'info')
    assert.equal(harness.runtime.sockets.length, 0)
  })
})

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

test('a synchronous socket send failure returns false and retires the connection', (context) => {
  context.mock.method(console, 'error', () => undefined)
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
      socket.remoteClose(closeCode, closeCode === 1008 ? 'Invalid MemeDrop key' : '')

      assert.equal(harness.disconnected, 1)
      assert.equal(harness.authenticationRejected, closeCode === 4001 ? 1 : 0)
      assert.equal(harness.runtime.activeTimers(3_000).length, 0)
      assert.equal(
        harness.statuses[harness.statuses.length - 1]?.message,
        closeCode === 4001
          ? 'Serveur MemeDrop : session Discord expirée, reconnecte-toi.'
          : 'Serveur MemeDrop : connexion refusée. Vérifie la clé du serveur.',
      )
      assert.equal(harness.statuses.at(-1)?.state, 'refused')
      assert.equal(
        harness.statuses.at(-1)?.reason,
        closeCode === 4001 ? 'session-expired' : 'access-denied',
      )
    })
  }
})

test('connection phases distinguish initial connection from automatic reconnection', () => {
  const harness = createHarness()
  const firstSocket = harness.runtime.sockets[0]
  assert.ok(firstSocket)

  assert.equal(harness.statuses.at(-1)?.state, 'connecting')
  firstSocket.open()
  assert.equal(harness.statuses.at(-1)?.state, 'authenticating')
  firstSocket.receive({ type: 'hello' })
  assert.equal(harness.statuses.at(-1)?.state, 'connected')

  firstSocket.remoteClose(1006)
  assert.equal(harness.statuses.at(-1)?.state, 'reconnecting')
  harness.runtime.run(harness.runtime.latestTimer(3_000))
  assert.equal(harness.statuses.at(-1)?.state, 'reconnecting')

  const secondSocket = harness.runtime.sockets[1]
  assert.ok(secondSocket)
  secondSocket.open()
  assert.equal(harness.statuses.at(-1)?.state, 'reconnecting')
  secondSocket.receive({ type: 'hello' })
  assert.equal(harness.statuses.at(-1)?.state, 'connected')
})

test('a policy close is not presented as an invalid server key', () => {
  const harness = createHarness()
  const socket = harness.runtime.sockets[0]
  assert.ok(socket)

  socket.remoteClose(1008, 'MemeDrop message rate exceeded')

  assert.equal(harness.statuses.at(-1)?.state, 'refused')
  assert.equal(harness.statuses.at(-1)?.reason, 'server-policy')
  assert.equal(
    harness.statuses.at(-1)?.message,
    'Serveur MemeDrop : connexion interrompue par le serveur.',
  )
  assert.equal(harness.runtime.activeTimers(3_000).length, 0)
})

test('the latest client state and active drop are replayed once after reconnect', (context) => {
  context.mock.method(console, 'error', () => undefined)
  context.mock.method(console, 'log', () => undefined)
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
