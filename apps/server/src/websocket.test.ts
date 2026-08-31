import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import test, { type TestContext } from 'node:test'
import WebSocket from 'ws'
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
  run: (context: { wsUrl: string }) => Promise<void>,
  getLatestAppVersion: () => string = () => '3.0.8',
) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(404).end()
  })
  const { wss } = createMemeDropWebSocketServer({
    server,
    serverKey,
    getLatestAppVersion,
    identityTokens,
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  try {
    await run({ wsUrl: `ws://127.0.0.1:${address.port}/ws` })
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

const validHeaders = () => ({
  authorization: `Bearer ${authToken}`,
  'x-memedrop-key': serverKey,
  'x-memedrop-app-version': '3.0.8',
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
    assert.deepEqual(await helloMessage, { type: 'hello' })
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

test('WebSocket snapshots use the current published app version', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  let latestAppVersion = '3.0.8'

  await withWebSocketServer(async ({ wsUrl }) => {
    const firstClient = createClient(wsUrl, validHeaders())
    const initialUsersMessage = waitForMessageType(firstClient, 'connected-users')
    await once(firstClient, 'open')
    const initialSnapshot = await initialUsersMessage
    assert.equal(initialSnapshot.latestAppVersion, '3.0.8')

    latestAppVersion = '3.0.9'
    const refreshedUsersMessage = waitForMessageType(firstClient, 'connected-users')
    const secondClient = createClient(wsUrl, validHeaders())
    await once(secondClient, 'open')

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
