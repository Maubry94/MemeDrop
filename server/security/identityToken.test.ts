import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import type { DiscordUser } from '../../shared/types.js'
import {
  createIdentityTokenService,
  MAX_IDENTITY_TOKEN_TTL_SECONDS,
  MIN_IDENTITY_TOKEN_TTL_SECONDS,
} from './identityToken.js'

const signingKey = Buffer.alloc(32, 0x42)
const signingSecret = signingKey.toString('base64url')
const discordUser: DiscordUser = {
  id: '123456789012345678',
  username: 'Meme User',
  avatarUrl: 'https://cdn.discordapp.com/avatars/123456789012345678/avatar.png?size=128',
}

const signPayload = (claims: Record<string, unknown>) => {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  const signature = createHmac('sha256', signingKey)
    .update(`md1.${payload}`, 'ascii')
    .digest('base64url')
  return `md1.${payload}.${signature}`
}

test('identity tokens round-trip trusted Discord claims and expiry', () => {
  const service = createIdentityTokenService({ signingSecret, ttlSeconds: 600 })
  const issued = service.issue(discordUser)
  const verification = service.verify(issued.authToken)

  assert.equal(verification.ok, true)
  if (!verification.ok) {
    return
  }

  assert.equal(verification.claims.sub, discordUser.id)
  assert.equal(verification.claims.name, discordUser.username)
  assert.equal(verification.claims.avatarUrl, discordUser.avatarUrl)
  assert.equal(verification.claims.exp - verification.claims.iat, 600)
  assert.equal(issued.authTokenExpiresAt, new Date(verification.claims.exp * 1000).toISOString())
})

test('identity tokens reject tampering and another signing secret', () => {
  const service = createIdentityTokenService({ signingSecret, ttlSeconds: 600 })
  const token = service.issue(discordUser).authToken
  const segments = token.split('.')
  assert.equal(segments.length, 3)

  const payload = segments[1] ?? ''
  const replacement = payload.endsWith('A') ? 'B' : 'A'
  const tamperedToken = `md1.${payload.slice(0, -1)}${replacement}.${segments[2]}`
  assert.deepEqual(service.verify(tamperedToken), { ok: false, reason: 'invalid' })

  const otherService = createIdentityTokenService({
    signingSecret: Buffer.alloc(32, 0x24).toString('base64url'),
    ttlSeconds: 600,
  })
  assert.deepEqual(otherService.verify(token), { ok: false, reason: 'invalid' })
})

test('identity token verification distinguishes expiry from malformed claims', () => {
  const service = createIdentityTokenService({ signingSecret, ttlSeconds: 600 })
  const now = Math.floor(Date.now() / 1000)
  const baseClaims = {
    iss: 'memedrop',
    aud: 'memedrop-ws',
    sub: discordUser.id,
    name: discordUser.username,
    avatarUrl: null,
    iat: now - 700,
    exp: now - 100,
    jti: '12345678-1234-4123-8123-123456789abc',
  }

  assert.deepEqual(service.verify(signPayload(baseClaims)), { ok: false, reason: 'expired' })
  assert.deepEqual(
    service.verify(signPayload({ ...baseClaims, exp: now + 100, aud: 'another-service' })),
    { ok: false, reason: 'invalid' },
  )
  assert.deepEqual(
    service.verify(signPayload({ ...baseClaims, iat: now + 61, exp: now + 300 })),
    { ok: false, reason: 'invalid' },
  )
})

test('identity token configuration and Discord identity data are fail-fast', () => {
  assert.throws(
    () => createIdentityTokenService({ signingSecret: 'not-base64url!', ttlSeconds: 600 }),
    /canonical base64url/,
  )
  assert.throws(
    () => createIdentityTokenService({ signingSecret, ttlSeconds: MIN_IDENTITY_TOKEN_TTL_SECONDS - 1 }),
    /must be an integer/,
  )
  assert.throws(
    () => createIdentityTokenService({ signingSecret, ttlSeconds: MAX_IDENTITY_TOKEN_TTL_SECONDS + 1 }),
    /must be an integer/,
  )

  const service = createIdentityTokenService({ signingSecret, ttlSeconds: 600 })
  assert.throws(() => service.issue({ ...discordUser, id: '123' }), /invalid user ID/)
  assert.throws(
    () => service.issue({ ...discordUser, avatarUrl: 'https://example.com/avatar.png' }),
    /invalid identity data/,
  )
})
