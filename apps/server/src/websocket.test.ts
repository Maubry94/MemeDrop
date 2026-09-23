import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import test, { type TestContext } from 'node:test'
import WebSocket from 'ws'
import type { Drop } from '@memedrop/protocol'
import { createIdentityTokenService } from './security/identityToken.js'
import { createMemeDropWebSocketServer } from './websocket.js'

const serverKey = 'websocket-test-key'
const identityTokens = createIdentityTokenService({
  signingSecret: Buffer.alloc(32, 0x51).toString('base64url'),
  ttlSeconds: 600,
})
const authToken = identityTokens.issue({
  id: '123456789012345678',
  username: 'WebSocket User',
  avatarUrl: null,
}).authToken
const tamperedAuthToken = `${authToken.slice(0, -1)}${authToken.endsWith('x') ? 'y' : 'x'}`

const silenceExpectedLogs = (context: TestContext) => {
  context.mock.method(console, 'log', () => undefined)
  context.mock.method(console, 'warn', () => undefined)
  context.mock.method(console, 'error', () => undefined)
}

const waitForClose = (socket: WebSocket) => new Promise<{ code: number; reason: string }>((resolve) => {
  socket.once('close', (code, reason) => resolve({ code, reason: reason.toString('utf8') }))
})

const waitForMessageType = (socket: WebSocket, expectedType: string) =>
  new Promise<Record<string, unknown>>((resolve) => {
    const listener = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>
      if (message.type === expectedType) {
        socket.off('message', listener)
        resolve(message)
      }
    }
    socket.on('message', listener)
  })

const withWebSocketServer = async (
  run: (context: {
    wsUrl: string
    broadcastDrop: ReturnType<typeof createMemeDropWebSocketServer>['broadcastDrop']
    getConnectedUsers: ReturnType<typeof createMemeDropWebSocketServer>['getConnectedUsers']
  }) => Promise<void>,
  getLatestAppVersion: () => string = () => '3.0.8',
  clientStateTimeoutMs?: number,
  completionGraceMs?: number,
) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(404).end()
  })
  const memeDropServer = createMemeDropWebSocketServer({
    server,
    serverKey,
    getLatestAppVersion,
    identityTokens,
    clientStateTimeoutMs,
    completionGraceMs,
  })
  const { wss } = memeDropServer

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  try {
    await run({
      wsUrl: `ws://127.0.0.1:${address.port}/ws`,
      broadcastDrop: memeDropServer.broadcastDrop,
      getConnectedUsers: memeDropServer.getConnectedUsers,
    })
  } finally {
    for (const client of wss.clients) {
      client.terminate()
    }
    await new Promise<void>((resolve) => wss.close(() => resolve()))
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

const createClient = (
  wsUrl: string,
  headers: Record<string, string>,
) => new WebSocket(wsUrl, { headers, followRedirects: false })

const validHeaders = (token = authToken) => ({
  authorization: `Bearer ${token}`,
  'x-memedrop-key': serverKey,
  'x-memedrop-app-version': '3.0.8',
})

const createDrop = (id: string): Drop => ({
  id,
  url: `https://cdn.discordapp.com/${id}.png`,
  contentType: 'image/png',
  fileName: `${id}.png`,
  caption: null,
  authorId: 'owner',
  ownerId: 'owner',
  author: 'Owner',
  authorAvatarUrl: null,
  createdAt: new Date(0).toISOString(),
})

test('WebSocket authentication uses distinct 4001 and 1008 close policies', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl }) => {
    const missingIdentity = createClient(wsUrl, { 'x-memedrop-key': serverKey })
    const missingIdentityClose = await waitForClose(missingIdentity)
    assert.equal(missingIdentityClose.code, 4001)
    assert.equal(missingIdentityClose.reason, 'Discord authentication required')

    const invalidKey = createClient(wsUrl, {
      authorization: `Bearer ${authToken}`,
      'x-memedrop-key': 'wrong-key',
    })
    const invalidKeyClose = await waitForClose(invalidKey)
    assert.equal(invalidKeyClose.code, 1008)
    assert.equal(invalidKeyClose.reason, 'Invalid MemeDrop key')

    const tamperedIdentity = createClient(wsUrl, {
      authorization: `Bearer ${tamperedAuthToken}`,
      'x-memedrop-key': serverKey,
    })
    assert.equal((await waitForClose(tamperedIdentity)).code, 4001)

    const validClient = createClient(wsUrl, validHeaders())
    const helloMessage = waitForMessageType(validClient, 'hello')
    await once(validClient, 'open')
    assert.deepEqual(await helloMessage, {
      type: 'hello', capabilities: { dropCompletionReason: true },
    })
    const close = waitForClose(validClient)
    validClient.close(1000)
    assert.equal((await close).code, 1000)
  })
})

test('WebSocket message bursts are bounded by the wired token bucket', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl }) => {
    const client = createClient(wsUrl, validHeaders())
    const helloMessage = waitForMessageType(client, 'hello')
    await once(client, 'open')
    await helloMessage

    const close = waitForClose(client)
    for (let index = 0; index < 31; index += 1) {
      client.send(JSON.stringify({
        type: 'client-state',
        dropsEnabled: index % 2 === 0,
      }))
    }

    const result = await close
    assert.equal(result.code, 1008)
    assert.equal(result.reason, 'MemeDrop message rate exceeded')
  })
})

test('WebSocket connections are capped per signed identity', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl }) => {
    const acceptedClients: WebSocket[] = []
    for (let index = 0; index < 4; index += 1) {
      const client = createClient(wsUrl, validHeaders())
      const helloMessage = waitForMessageType(client, 'hello')
      await once(client, 'open')
      await helloMessage
      acceptedClients.push(client)
    }

    const excessClient = createClient(wsUrl, validHeaders())
    const excessClose = await waitForClose(excessClient)
    assert.equal(excessClose.code, 1013)
    assert.equal(excessClose.reason, 'Too many MemeDrop connections')

    await Promise.all(acceptedClients.map(async (client) => {
      const close = waitForClose(client)
      client.close(1000)
      await close
    }))
  })
})

test('only one temporary replacement may exceed the per-identity cap', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl }) => {
    const acceptedClients: WebSocket[] = []
    for (let index = 0; index < 4; index += 1) {
      const client = createClient(wsUrl, {
        ...validHeaders(),
        'x-memedrop-client-instance-id': `capacity-instance-${index}`,
      })
      const hello = waitForMessageType(client, 'hello')
      await once(client, 'open')
      await hello
      client.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
      acceptedClients.push(client)
    }

    const pendingReplacement = createClient(wsUrl, {
      ...validHeaders(),
      'x-memedrop-client-instance-id': 'capacity-instance-0',
    })
    const replacementHello = waitForMessageType(pendingReplacement, 'hello')
    await once(pendingReplacement, 'open')
    await replacementHello
    acceptedClients.push(pendingReplacement)

    const excessReplacement = createClient(wsUrl, {
      ...validHeaders(),
      'x-memedrop-client-instance-id': 'capacity-instance-0',
    })
    const excessClose = await waitForClose(excessReplacement)
    assert.equal(excessClose.code, 1013)
    assert.equal(excessClose.reason, 'Too many MemeDrop connections')

    await Promise.all(acceptedClients.map(async (client) => {
      const close = waitForClose(client)
      client.close(1000)
      await close
    }))
  })
})

test('WebSocket snapshots use the current published app version', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  let latestAppVersion = '3.0.8'

  await withWebSocketServer(async ({ wsUrl }) => {
    const firstClient = createClient(wsUrl, validHeaders())
    const helloMessage = waitForMessageType(firstClient, 'hello')
    await once(firstClient, 'open')
    await helloMessage
    const initialUsersMessage = waitForMessageType(firstClient, 'connected-users')
    firstClient.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
    const initialSnapshot = await initialUsersMessage
    assert.equal(initialSnapshot.latestAppVersion, '3.0.8')

    latestAppVersion = '3.0.9'
    const refreshedUsersMessage = waitForMessageType(firstClient, 'connected-users')
    const secondClient = createClient(wsUrl, validHeaders())
    const secondHelloMessage = waitForMessageType(secondClient, 'hello')
    await once(secondClient, 'open')
    await secondHelloMessage
    secondClient.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))

    const refreshedSnapshot = await refreshedUsersMessage
    assert.equal(refreshedSnapshot.latestAppVersion, '3.0.9')
    const users = refreshedSnapshot.users as Array<Record<string, unknown>>
    assert.equal(users[0]?.latestAppVersion, '3.0.9')
    assert.equal(users[0]?.updateAvailable, true)

    await Promise.all([firstClient, secondClient].map(async (client) => {
      const close = waitForClose(client)
      client.close(1000)
      await close
    }))
  }, () => latestAppVersion)
})

test('clients become eligible only after their initial enabled state', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl, broadcastDrop, getConnectedUsers }) => {
    const client = createClient(wsUrl, validHeaders())
    const helloMessage = waitForMessageType(client, 'hello')
    await once(client, 'open')
    await helloMessage

    assert.deepEqual(getConnectedUsers(), [])
    assert.equal(broadcastDrop(createDrop('before-state')), 0)

    const disabledSnapshotPromise = waitForMessageType(client, 'connected-users')
    client.send(JSON.stringify({ type: 'client-state', dropsEnabled: false }))
    const disabledSnapshot = await disabledSnapshotPromise
    const disabledUsers = disabledSnapshot.users as Array<Record<string, unknown>>
    assert.equal(disabledUsers.length, 1)
    assert.equal(disabledUsers[0]?.dropsEnabled, false)
    assert.equal(broadcastDrop(createDrop('while-disabled')), 0)

    const enabledSnapshotPromise = waitForMessageType(client, 'connected-users')
    client.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
    await enabledSnapshotPromise

    const activeDropPromise = waitForMessageType(client, 'active-drop')
    assert.equal(broadcastDrop(createDrop('after-state')), 1)
    const activeDrop = await activeDropPromise
    assert.equal((activeDrop.drop as Record<string, unknown>).id, 'after-state')

    const pausedSnapshotPromise = waitForMessageType(client, 'connected-users')
    const clearDropPromise = waitForMessageType(client, 'clear-drop')
    client.send(JSON.stringify({ type: 'client-state', dropsEnabled: false }))
    await Promise.all([pausedSnapshotPromise, clearDropPromise])
    assert.equal(broadcastDrop(createDrop('after-pause')), 0)

    const close = waitForClose(client)
    client.close(1000)
    await close
  })
})

test('seven WebSocket clients wait for the group, including legacy completion messages', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl, broadcastDrop, getConnectedUsers }) => {
    const clients: WebSocket[] = []
    const delivered = new Map<WebSocket, string[]>()

    for (let index = 0; index < 7; index += 1) {
      const token = identityTokens.issue({
        id: String(123456789012345678n + BigInt(index)),
        username: `Stress user ${index}`,
        avatarUrl: null,
      }).authToken
      const client = createClient(wsUrl, {
        ...validHeaders(token),
        'x-memedrop-client-instance-id': `stress-client-${index}-instance`,
      })
      delivered.set(client, [])
      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>
        if (message.type !== 'active-drop') {
          return
        }
        const drop = message.drop as Record<string, unknown>
        if (typeof drop.id === 'string') {
          delivered.get(client)?.push(drop.id)
        }
      })
      await once(client, 'open')
      client.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
      clients.push(client)
    }

    const readyDeadline = Date.now() + 1_000
    while (getConnectedUsers().length < 7 && Date.now() < readyDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(getConnectedUsers().length, 7)

    assert.equal(broadcastDrop(createDrop('first-stress-drop')), 7)
    const firstDeliveryDeadline = Date.now() + 1_000
    while (
      clients.some((client) => delivered.get(client)?.length !== 1) &&
      Date.now() < firstDeliveryDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.ok(clients.every((client) => delivered.get(client)?.[0] === 'first-stress-drop'))

    assert.equal(broadcastDrop(createDrop('second-stress-drop')), 7)
    for (const client of clients.slice(0, 6)) {
      client.send(JSON.stringify({ type: 'drop-completed', dropId: 'first-stress-drop' }))
    }

    await new Promise((resolve) => setTimeout(resolve, 75))
    for (const client of clients) {
      assert.deepEqual(delivered.get(client), ['first-stress-drop'])
    }

    clients[6]?.send(JSON.stringify({
      type: 'drop-completed',
      dropId: 'first-stress-drop',
    }))
    const silentRecoveryDeadline = Date.now() + 1_000
    while (
      clients.some((client) => delivered.get(client)?.length !== 2) &&
      Date.now() < silentRecoveryDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    for (const client of clients) {
      assert.deepEqual(delivered.get(client), ['first-stress-drop', 'second-stress-drop'])
    }
  })
})

test('a silent WebSocket player is cleared before everyone advances together', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl, broadcastDrop }) => {
    const clients: WebSocket[] = []
    const events = new Map<WebSocket, string[]>()
    for (let index = 0; index < 7; index += 1) {
      const token = identityTokens.issue({
        id: String(223456789012345678n + BigInt(index)),
        username: `Synchronized user ${index}`,
        avatarUrl: null,
      }).authToken
      const client = createClient(wsUrl, validHeaders(token))
      const hello = waitForMessageType(client, 'hello')
      events.set(client, [])
      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>
        if (message.type === 'active-drop') {
          events.get(client)?.push(String((message.drop as Drop).id))
        } else if (message.type === 'clear-drop') {
          events.get(client)?.push('clear')
        }
      })
      await once(client, 'open')
      await hello
      const ready = waitForMessageType(client, 'connected-users')
      client.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
      await ready
      clients.push(client)
    }

    const firstDrops = clients.map((client) => waitForMessageType(client, 'active-drop'))
    assert.equal(broadcastDrop(createDrop('together-first')), 7)
    await Promise.all(firstDrops)
    assert.equal(broadcastDrop(createDrop('together-second')), 7)

    // Local skips and failures must not start the grace timer or cut peers.
    for (const [index, reason] of ['skipped', 'error', 'timeout'].entries()) {
      const client = clients[index]!
      client.send(JSON.stringify({
        type: 'drop-completed', dropId: 'together-first', reason,
      }))
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
    for (const client of clients) {
      assert.ok(!events.get(client)?.includes('together-second'))
    }

    const nextDrops = clients.map((client) => waitForMessageType(client, 'active-drop'))
    for (const client of clients.slice(3, 6)) {
      client.send(JSON.stringify({
        type: 'drop-completed', dropId: 'together-first', reason: 'ended',
      }))
    }
    const nextMessages = await Promise.all(nextDrops)
    assert.ok(nextMessages.every((message) => (message.drop as Drop).id === 'together-second'))
    for (const client of clients) {
      const received = events.get(client)!
      assert.equal(received[0], 'together-first')
      assert.equal(received.at(-1), 'together-second')
      assert.ok(received.includes('clear'))
      assert.equal(received.filter((event) => event === 'together-second').length, 1)
    }

    // A late ACK for the previous drop must not release the new group.
    assert.equal(broadcastDrop(createDrop('together-third')), 7)
    clients[6]!.send(JSON.stringify({
      type: 'drop-completed', dropId: 'together-first', reason: 'ended',
    }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.ok(clients.every((client) => !events.get(client)?.includes('together-third')))
  }, () => '3.0.8', undefined, 100)
})

test('a ready reconnect replaces only the same client instance', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl, broadcastDrop, getConnectedUsers }) => {
    const instanceHeaders = {
      ...validHeaders(),
      'x-memedrop-client-instance-id': 'instance-1234567890abcdef',
    }
    const firstClient = createClient(wsUrl, instanceHeaders)
    const firstHello = waitForMessageType(firstClient, 'hello')
    await once(firstClient, 'open')
    await firstHello
    const firstReady = waitForMessageType(firstClient, 'connected-users')
    firstClient.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
    await firstReady

    const firstActiveDrop = waitForMessageType(firstClient, 'active-drop')
    assert.equal(broadcastDrop(createDrop('active-before-reconnect')), 1)
    assert.equal(
      ((await firstActiveDrop).drop as Record<string, unknown>).id,
      'active-before-reconnect',
    )
    assert.equal(broadcastDrop(createDrop('queued-before-reconnect')), 1)

    const firstClose = waitForClose(firstClient)
    const replacement = createClient(wsUrl, instanceHeaders)
    const replacementHello = waitForMessageType(replacement, 'hello')
    await once(replacement, 'open')
    await replacementHello
    const replacementReady = waitForMessageType(replacement, 'connected-users')
    const nextSharedDrop = waitForMessageType(replacement, 'active-drop')
    replacement.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
    await replacementReady

    const replaced = await firstClose
    assert.equal(replaced.code, 4002)
    assert.equal(replaced.reason, 'MemeDrop connection replaced')
    assert.equal(getConnectedUsers().length, 1)
    assert.equal(getConnectedUsers()[0]?.connections, 1)
    assert.equal(
      ((await nextSharedDrop).drop as Record<string, unknown>).id,
      'queued-before-reconnect',
    )

    replacement.send(JSON.stringify({
      type: 'drop-completed',
      dropId: 'queued-before-reconnect',
    }))

    const close = waitForClose(replacement)
    replacement.close(1000)
    await close
  })
})

test('a reconnect waits for the other viewer and rejoins at the next shared drop', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl, broadcastDrop }) => {
    const instanceHeaders = {
      ...validHeaders(), 'x-memedrop-client-instance-id': 'reconnect-group-instance',
    }
    const connectReady = async (headers: Record<string, string>) => {
      const client = createClient(wsUrl, headers)
      const hello = waitForMessageType(client, 'hello')
      await once(client, 'open')
      await hello
      const ready = waitForMessageType(client, 'connected-users')
      client.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
      await ready
      return client
    }
    const firstClient = await connectReady(instanceHeaders)
    const peer = await connectReady({
      ...validHeaders(), 'x-memedrop-client-instance-id': 'uninterrupted-group-peer',
    })
    const initialMessages = [firstClient, peer].map((client) => waitForMessageType(client, 'active-drop'))
    assert.equal(broadcastDrop(createDrop('before-group-reconnect')), 2)
    await Promise.all(initialMessages)
    assert.equal(broadcastDrop(createDrop('after-group-reconnect')), 2)

    const oldClosed = waitForClose(firstClient)
    const replacement = createClient(wsUrl, instanceHeaders)
    const delivered: string[] = []
    replacement.on('message', (data) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>
      if (message.type === 'active-drop') {
        delivered.push((message.drop as Drop).id)
      }
    })
    const hello = waitForMessageType(replacement, 'hello')
    await once(replacement, 'open')
    await hello
    const ready = waitForMessageType(replacement, 'connected-users')
    replacement.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
    await Promise.all([ready, oldClosed])
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.deepEqual(delivered, [])

    // New viewers also join the group on the next transition, not mid-video.
    const newcomer = await connectReady({
      ...validHeaders(), 'x-memedrop-client-instance-id': 'new-viewer-group-instance',
    })
    const nextMessages = [peer, replacement, newcomer].map((client) => waitForMessageType(client, 'active-drop'))
    peer.send(JSON.stringify({
      type: 'drop-completed', dropId: 'before-group-reconnect', reason: 'ended',
    }))
    for (const message of await Promise.all(nextMessages)) {
      assert.equal((message.drop as Drop).id, 'after-group-reconnect')
    }
    assert.deepEqual(delivered, ['after-group-reconnect'])
  })
})

test('a paused reconnect never receives the replaced socket queue', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl, broadcastDrop }) => {
    const instanceHeaders = {
      ...validHeaders(),
      'x-memedrop-client-instance-id': 'paused-reconnect-instance',
    }
    const firstClient = createClient(wsUrl, instanceHeaders)
    const firstHello = waitForMessageType(firstClient, 'hello')
    await once(firstClient, 'open')
    await firstHello
    const firstReady = waitForMessageType(firstClient, 'connected-users')
    firstClient.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
    await firstReady

    const firstDrop = waitForMessageType(firstClient, 'active-drop')
    assert.equal(broadcastDrop(createDrop('paused-active')), 1)
    await firstDrop
    assert.equal(broadcastDrop(createDrop('paused-queued')), 1)

    const firstClose = waitForClose(firstClient)
    const replacement = createClient(wsUrl, instanceHeaders)
    const replacementActiveDrops: string[] = []
    replacement.on('message', (data) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>
      if (message.type === 'active-drop') {
        replacementActiveDrops.push(
          String((message.drop as Record<string, unknown>).id),
        )
      }
    })
    const replacementHello = waitForMessageType(replacement, 'hello')
    await once(replacement, 'open')
    await replacementHello
    const clearDrop = waitForMessageType(replacement, 'clear-drop')
    replacement.send(JSON.stringify({ type: 'client-state', dropsEnabled: false }))

    await Promise.all([firstClose, clearDrop])
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.deepEqual(replacementActiveDrops, [])
    assert.equal(broadcastDrop(createDrop('paused-future')), 0)

    const close = waitForClose(replacement)
    replacement.close(1000)
    await close
  })
})

test('different client instances for one Discord identity remain distinct devices', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl, getConnectedUsers }) => {
    const clients: WebSocket[] = []
    for (const clientInstanceId of [
      'first-instance-1234567890',
      'second-instance-123456789',
    ]) {
      const client = createClient(wsUrl, {
        ...validHeaders(),
        'x-memedrop-client-instance-id': clientInstanceId,
      })
      const hello = waitForMessageType(client, 'hello')
      await once(client, 'open')
      await hello
      const ready = waitForMessageType(client, 'connected-users')
      client.send(JSON.stringify({ type: 'client-state', dropsEnabled: true }))
      await ready
      clients.push(client)
    }

    assert.equal(getConnectedUsers().length, 1)
    assert.equal(getConnectedUsers()[0]?.connections, 2)

    await Promise.all(clients.map(async (client) => {
      const close = waitForClose(client)
      client.close(1000)
      await close
    }))
  })
})

test('a connection that never sends its initial state is closed', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  await withWebSocketServer(async ({ wsUrl, getConnectedUsers }) => {
    const client = createClient(wsUrl, validHeaders())
    const close = waitForClose(client)
    const result = await close

    assert.equal(result.code, 1008)
    assert.equal(result.reason, 'MemeDrop client state required')
    assert.deepEqual(getConnectedUsers(), [])
  }, () => '3.0.8', 20)
})
