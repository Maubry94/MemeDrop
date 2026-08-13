import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import test, { type TestContext } from 'node:test'
import type { DiscordUser } from '../../shared/types.js'
import { createDiscordOAuthHandlers } from './oauth.js'

type HttpResult = {
  statusCode: number
  headers: http.IncomingHttpHeaders
  body: string
}

type OAuthStartPayload = {
  sessionId: string
  pollToken: string
  authUrl: string
  expiresAt: string
}

const silenceExpectedLogs = (context: TestContext) => {
  context.mock.method(console, 'log', () => undefined)
  context.mock.method(console, 'warn', () => undefined)
  context.mock.method(console, 'error', () => undefined)
}

const requestLocal = (
  origin: string,
  pathname: string,
  headers: Record<string, string> = {},
) => new Promise<HttpResult>((resolve, reject) => {
  const request = http.get(`${origin}${pathname}`, { headers }, (response) => {
    const chunks: Buffer[] = []
    response.on('data', (chunk: Buffer) => chunks.push(chunk))
    response.on('end', () => {
      resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      })
    })
  })
  request.on('error', reject)
})

const withOAuthServer = async (
  run: (context: {
    origin: string
    issuedUsers: DiscordUser[]
  }) => Promise<void>,
) => {
  const issuedUsers: DiscordUser[] = []
  const handlers = createDiscordOAuthHandlers({
    clientId: 'discord-client-id',
    clientSecret: 'discord-client-secret',
    publicBaseUrl: 'https://memedrop.example',
    serverKey: 'server-test-key',
    identityTokens: {
      issue: (user) => {
        issuedUsers.push(user)
        return {
          authToken: 'issued-auth-token',
          authTokenExpiresAt: '2030-01-01T00:00:00.000Z',
        }
      },
    },
  })

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')

    if (requestUrl.pathname === '/auth/discord/start') {
      handlers.handleDiscordAuthStart(request, response)
      return
    }
    if (requestUrl.pathname.startsWith('/auth/discord/status/')) {
      handlers.handleDiscordAuthStatus(request, response, requestUrl)
      return
    }
    if (requestUrl.pathname === '/auth/discord/callback') {
      void handlers.handleDiscordAuthCallback(request, response, requestUrl)
      return
    }

    response.writeHead(404).end()
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
    await run({ origin: `http://127.0.0.1:${address.port}`, issuedUsers })
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

const startSession = async (origin: string) => {
  const response = await requestLocal(origin, '/auth/discord/start', {
    'x-memedrop-key': 'server-test-key',
  })
  assert.equal(response.statusCode, 200)
  return JSON.parse(response.body) as OAuthStartPayload
}

test('OAuth polling requires its distinct secret and consumes a completed session once', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = input.toString()
    if (url === 'https://discord.com/api/oauth2/token') {
      return new Response(JSON.stringify({ access_token: 'discord-access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url === 'https://discord.com/api/users/@me') {
      return new Response(JSON.stringify({
        id: '123456789012345678',
        username: 'Discord User',
        avatar: 'avatar-hash',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`Unexpected OAuth fetch: ${url}`)
  })

  await withOAuthServer(async ({ origin, issuedUsers }) => {
    const session = await startSession(origin)
    assert.match(session.sessionId, /^[0-9a-f-]{36}$/i)
    assert.match(session.pollToken, /^[A-Za-z0-9_-]{43}$/)
    assert.notEqual(session.sessionId, session.pollToken)

    const authUrl = new URL(session.authUrl)
    assert.equal(authUrl.origin, 'https://discord.com')
    assert.equal(authUrl.searchParams.get('state'), session.sessionId)
    assert.equal(authUrl.searchParams.get('scope'), 'identify')
    assert.equal(
      authUrl.searchParams.get('redirect_uri'),
      'https://memedrop.example/auth/discord/callback',
    )

    const statusPath = `/auth/discord/status/${session.sessionId}`
    const missingPollToken = await requestLocal(origin, statusPath, {
      'x-memedrop-key': 'server-test-key',
    })
    assert.equal(missingPollToken.statusCode, 401)

    const pending = await requestLocal(origin, statusPath, {
      'x-memedrop-key': 'server-test-key',
      'x-memedrop-oauth-poll-token': session.pollToken,
    })
    assert.deepEqual(JSON.parse(pending.body), { status: 'pending' })

    const callback = await requestLocal(
      origin,
      `/auth/discord/callback?code=oauth-code&state=${encodeURIComponent(session.sessionId)}`,
    )
    assert.equal(callback.statusCode, 200)

    const done = await requestLocal(origin, statusPath, {
      'x-memedrop-key': 'server-test-key',
      'x-memedrop-oauth-poll-token': session.pollToken,
    })
    assert.equal(done.statusCode, 200)
    assert.deepEqual(JSON.parse(done.body), {
      status: 'done',
      user: {
        id: '123456789012345678',
        username: 'Discord User',
        avatarUrl: 'https://cdn.discordapp.com/avatars/123456789012345678/avatar-hash.png?size=128',
      },
      authToken: 'issued-auth-token',
      authTokenExpiresAt: '2030-01-01T00:00:00.000Z',
    })
    assert.equal(issuedUsers.length, 1)

    const replay = await requestLocal(origin, statusPath, {
      'x-memedrop-key': 'server-test-key',
      'x-memedrop-oauth-poll-token': session.pollToken,
    })
    assert.deepEqual(JSON.parse(replay.body), { status: 'expired' })
  })
})

test('a second OAuth callback cannot race the callback already processing', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  let releaseTokenExchange: (() => void) | undefined
  let signalTokenExchangeStarted: (() => void) | undefined
  const tokenExchangeStarted = new Promise<void>((resolve) => {
    signalTokenExchangeStarted = resolve
  })
  const tokenExchangeGate = new Promise<void>((resolve) => {
    releaseTokenExchange = resolve
  })
  let tokenExchangeCount = 0

  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = input.toString()
    if (url === 'https://discord.com/api/oauth2/token') {
      tokenExchangeCount += 1
      signalTokenExchangeStarted?.()
      await tokenExchangeGate
      return new Response(JSON.stringify({ access_token: 'discord-access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url === 'https://discord.com/api/users/@me') {
      return new Response(JSON.stringify({
        id: '123456789012345678',
        username: 'Discord User',
        avatar: null,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`Unexpected OAuth fetch: ${url}`)
  })

  await withOAuthServer(async ({ origin }) => {
    const session = await startSession(origin)
    const callbackPath =
      `/auth/discord/callback?code=oauth-code&state=${encodeURIComponent(session.sessionId)}`

    const firstCallback = requestLocal(origin, callbackPath)
    await tokenExchangeStarted
    const duplicateCallback = await requestLocal(origin, callbackPath)

    assert.equal(duplicateCallback.statusCode, 400)
    assert.match(duplicateCallback.body, /Connexion invalide/)
    assert.equal(tokenExchangeCount, 1)

    releaseTokenExchange?.()
    const successfulCallback = await firstCallback
    assert.equal(successfulCallback.statusCode, 200)

    const done = await requestLocal(origin, `/auth/discord/status/${session.sessionId}`, {
      'x-memedrop-key': 'server-test-key',
      'x-memedrop-oauth-poll-token': session.pollToken,
    })
    assert.equal((JSON.parse(done.body) as { status: string }).status, 'done')
  })
})

test('a failed OAuth exchange deletes the session instead of leaving it pending', { timeout: 5000 }, async (context) => {
  silenceExpectedLogs(context)
  context.mock.method(
    globalThis,
    'fetch',
    async (_input: string | URL | Request) => new Response('Discord unavailable', { status: 502 }),
  )

  await withOAuthServer(async ({ origin, issuedUsers }) => {
    const session = await startSession(origin)
    const callback = await requestLocal(
      origin,
      `/auth/discord/callback?code=oauth-code&state=${encodeURIComponent(session.sessionId)}`,
    )
    assert.equal(callback.statusCode, 500)
    assert.match(callback.body, /Connexion impossible/)

    const status = await requestLocal(origin, `/auth/discord/status/${session.sessionId}`, {
      'x-memedrop-key': 'server-test-key',
      'x-memedrop-oauth-poll-token': session.pollToken,
    })
    assert.deepEqual(JSON.parse(status.body), { status: 'expired' })
    assert.equal(issuedUsers.length, 0)
  })
})
