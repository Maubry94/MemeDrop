import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { REST } from 'discord.js'
import type { APIRequest, ChatInputCommandInteraction, Client, ResponseLike } from 'discord.js'
import { runWithDiscordDiagnostics } from './diagnostics.js'
import { attachDiscordRestDiagnostics } from './restDiagnostics.js'

const interaction = {
  id: '1552835617849614506',
  commandName: 'drop',
  createdTimestamp: Date.now(),
  options: { getAttachment: () => null },
} as unknown as ChatInputCommandInteraction

function request(path: APIRequest['path'], method = 'POST', retries = 0): APIRequest {
  return {
    path,
    method,
    retries,
    route: '/private-route-token',
    options: { headers: { authorization: 'Bot private-authorization-token' } },
    data: { body: { content: 'private-response-content' } },
  } as APIRequest
}

function response(status: number, retryAfter?: string): ResponseLike {
  const headers = new Headers({ 'x-private-header': 'private-header-value' })
  if (retryAfter !== undefined) headers.set('retry-after', retryAfter)
  return new Response(null, { status, headers }) as unknown as ResponseLike
}

function parseEntries(lines: string[]) {
  return lines.map(line => {
    assert.ok(line.startsWith('[discord-diag] '))
    return JSON.parse(line.slice('[discord-diag] '.length)) as Record<string, unknown>
  })
}

test('REST diagnostics observes callback 429s without exposing request secrets', async () => {
  const emitter = new EventEmitter()
  const detach = attachDiscordRestDiagnostics(emitter as unknown as Client['rest'])
  const lines: string[] = []

  await runWithDiscordDiagnostics(interaction, async () => {
    emitter.emit('response', request(
      '/interactions/1552835617849614506/private-interaction-token/callback?private-query=value',
    ), response(429, '1.5'))
  }, { logger: line => lines.push(line) })

  const limited = parseEntries(lines).find(entry => entry.status === 429)
  assert.ok(limited)
  assert.equal(limited.route, 'interaction-callback')
  assert.equal(limited.method, 'POST')
  assert.equal(limited.retries, 0)
  assert.equal(limited.retryAfterMs, 1_500)
  assert.doesNotMatch(lines.join('\n'), /private-|authorization|\/interactions\//)
  detach()
  assert.equal(emitter.listenerCount('response'), 0)
})

test('REST diagnostics observes a successful original response after an SDK retry', async () => {
  const emitter = new EventEmitter()
  const detach = attachDiscordRestDiagnostics(emitter as unknown as Client['rest'])
  const lines: string[] = []

  await runWithDiscordDiagnostics(interaction, async () => {
    emitter.emit('response', request(
      '/webhooks/1552835617849614506/private-webhook-token/messages/@original',
      'PATCH',
      1,
    ), response(200))
  }, { logger: line => lines.push(line) })

  const successful = parseEntries(lines).find(entry => entry.status === 200)
  assert.ok(successful)
  assert.equal(successful.route, 'original-response')
  assert.equal(successful.method, 'PATCH')
  assert.equal(successful.retries, 1)
  assert.doesNotMatch(lines.join('\n'), /private-|\/webhooks\//)
  detach()
})

test('REST diagnostics ignores unrelated routes and requests outside an active trace', async () => {
  const emitter = new EventEmitter()
  const detach = attachDiscordRestDiagnostics(emitter as unknown as Client['rest'])
  const lines: string[] = []

  emitter.emit('response', request(
    '/interactions/1552835617849614506/private-interaction-token/callback',
  ), response(429, '1'))

  await runWithDiscordDiagnostics(interaction, async () => {
    for (const item of [
      request('/channels/1552835617849614506/messages'),
      request('/webhooks/1552835617849614506/private-webhook-token'),
      request('/webhooks/1552835617849614506/private-webhook-token/messages/1552835617849614506', 'PATCH'),
      request('/interactions/1552835617849614506/private-interaction-token/callback', 'GET'),
      request('/webhooks/1552835617849614506/private-webhook-token/messages/@original', 'GET'),
    ]) {
      emitter.emit('response', item, response(429, '1'))
    }
    detach()
    emitter.emit('response', request(
      '/interactions/1552835617849614506/private-interaction-token/callback',
    ), response(429, '1'))
  }, { logger: line => lines.push(line) })

  assert.equal(parseEntries(lines).filter(entry => 'status' in entry).length, 0)
})

test('REST diagnostics never forwards invalid or arbitrary Retry-After values', async () => {
  const emitter = new EventEmitter()
  const detach = attachDiscordRestDiagnostics(emitter as unknown as Client['rest'])
  const lines: string[] = []

  await runWithDiscordDiagnostics(interaction, async () => {
    for (const value of ['private-retry-value', 'Infinity', '-1', '']) {
      emitter.emit('response', request(
        '/interactions/1552835617849614506/private-interaction-token/callback',
      ), response(429, value))
    }
  }, { logger: line => lines.push(line) })

  const limited = parseEntries(lines).filter(entry => entry.status === 429)
  assert.equal(limited.length, 4)
  for (const entry of limited) assert.equal(entry.retryAfterMs, null)
  assert.doesNotMatch(lines.join('\n'), /private-|Infinity/)
  detach()
})

test('installed Discord REST emits callback 429 diagnostics even without rateLimited events', async () => {
  let attempts = 0
  let rateLimitedEvents = 0
  const lines: string[] = []
  // Exercise the actual SDK's BurstHandler, with an in-memory HTTP transport.
  // No request is sent to Discord and the SDK retains its own retry policy.
  const rest = new REST({
    offset: 0,
    hashSweepInterval: 0,
    handlerSweepInterval: 0,
    makeRequest: async () => {
      attempts += 1
      if (attempts === 1) return response(429, '0')
      if (attempts === 2) return response(500)
      return response(204)
    },
  })
  rest.on('rateLimited', () => { rateLimitedEvents += 1 })
  const detach = attachDiscordRestDiagnostics(rest)

  await runWithDiscordDiagnostics(interaction, async () => {
    await rest.post('/interactions/1552835617849614506/private-interaction-token/callback', {
      auth: false,
      body: { type: 5 },
    })
  }, { logger: line => lines.push(line) })

  assert.equal(attempts, 3)
  assert.equal(rateLimitedEvents, 0)
  const entries = parseEntries(lines)
  assert.ok(entries.some(entry => entry.status === 429 && entry.retryAfterMs === 0))
  assert.ok(entries.some(entry => entry.status === 500))
  assert.ok(entries.some(entry => entry.status === 204 && entry.retries === 1))
  assert.doesNotMatch(lines.join('\n'), /private-/)
  detach()
})
