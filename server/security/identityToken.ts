import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { DiscordUser } from '../../shared/types.js'

const TOKEN_PREFIX = 'md1'
const TOKEN_ISSUER = 'memedrop'
const TOKEN_AUDIENCE = 'memedrop-ws'
const CLOCK_SKEW_SECONDS = 60
const MAX_TOKEN_LENGTH = 4096
const MAX_PAYLOAD_LENGTH = 2048
const DISCORD_USER_ID_PATTERN = /^\d{17,20}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

export const DEFAULT_IDENTITY_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
export const MAX_IDENTITY_TOKEN_TTL_SECONDS = DEFAULT_IDENTITY_TOKEN_TTL_SECONDS
export const MIN_IDENTITY_TOKEN_TTL_SECONDS = 5 * 60

export type IdentityTokenClaims = {
  iss: typeof TOKEN_ISSUER
  aud: typeof TOKEN_AUDIENCE
  sub: string
  name: string
  avatarUrl: string | null
  iat: number
  exp: number
  jti: string
}

export type IssuedAuthToken = {
  authToken: string
  authTokenExpiresAt: string
}

export type IdentityTokenVerificationResult =
  | {
      ok: true
      claims: IdentityTokenClaims
    }
  | {
      ok: false
      reason: 'invalid' | 'expired'
    }

export type IdentityTokenService = {
  issue: (user: DiscordUser) => IssuedAuthToken
  verify: (authToken: string) => IdentityTokenVerificationResult
}

type IdentityTokenServiceOptions = {
  signingSecret: string
  ttlSeconds: number
}

const decodeCanonicalBase64Url = (value: string): Buffer | null => {
  if (!value || !BASE64URL_PATTERN.test(value)) {
    return null
  }

  const decoded = Buffer.from(value, 'base64url')
  return decoded.toString('base64url') === value ? decoded : null
}

const decodeSigningSecret = (value: string): Buffer => {
  const decoded = decodeCanonicalBase64Url(value)

  if (!decoded || decoded.length < 32) {
    throw new Error(
      'MEMEDROP_IDENTITY_SIGNING_SECRET must be canonical base64url encoding of at least 32 random bytes.',
    )
  }

  return decoded
}

const isSafeDiscordAvatarUrl = (value: string | null): boolean => {
  if (value === null) {
    return true
  }

  if (value.length === 0 || value.length > 1024) {
    return false
  }

  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'cdn.discordapp.com' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname.startsWith('/avatars/')
    )
  } catch {
    return false
  }
}

const isIdentityTokenClaims = (value: unknown): value is IdentityTokenClaims => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const claims = value as Partial<IdentityTokenClaims>
  const expectedKeys = ['aud', 'avatarUrl', 'exp', 'iat', 'iss', 'jti', 'name', 'sub']
  const actualKeys = Object.keys(value).sort()

  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index]) &&
    claims.iss === TOKEN_ISSUER &&
    claims.aud === TOKEN_AUDIENCE &&
    typeof claims.sub === 'string' &&
    DISCORD_USER_ID_PATTERN.test(claims.sub) &&
    typeof claims.name === 'string' &&
    claims.name.length > 0 &&
    claims.name.length <= 100 &&
    claims.name.trim() === claims.name &&
    !/[\u0000-\u001f\u007f]/.test(claims.name) &&
    (claims.avatarUrl === null || typeof claims.avatarUrl === 'string') &&
    isSafeDiscordAvatarUrl(claims.avatarUrl ?? null) &&
    Number.isSafeInteger(claims.iat) &&
    Number.isSafeInteger(claims.exp) &&
    typeof claims.jti === 'string' &&
    UUID_PATTERN.test(claims.jti)
  )
}

export const createIdentityTokenService = ({
  signingSecret,
  ttlSeconds,
}: IdentityTokenServiceOptions): IdentityTokenService => {
  const signingKey = decodeSigningSecret(signingSecret)

  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < MIN_IDENTITY_TOKEN_TTL_SECONDS ||
    ttlSeconds > MAX_IDENTITY_TOKEN_TTL_SECONDS
  ) {
    throw new Error(
      `MEMEDROP_IDENTITY_TOKEN_TTL_SECONDS must be an integer between ${MIN_IDENTITY_TOKEN_TTL_SECONDS} and ${MAX_IDENTITY_TOKEN_TTL_SECONDS}.`,
    )
  }

  const sign = (payloadSegment: string) =>
    createHmac('sha256', signingKey)
      .update(`${TOKEN_PREFIX}.${payloadSegment}`, 'ascii')
      .digest()

  const issue = (user: DiscordUser): IssuedAuthToken => {
    const userId = user.id.trim()
    const name = user.username.trim()

    if (!DISCORD_USER_ID_PATTERN.test(userId)) {
      throw new Error('Discord returned an invalid user ID.')
    }

    if (
      name.length === 0 ||
      name.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(name) ||
      !isSafeDiscordAvatarUrl(user.avatarUrl)
    ) {
      throw new Error('Discord returned invalid identity data.')
    }

    const issuedAt = Math.floor(Date.now() / 1000)
    const expiresAt = issuedAt + ttlSeconds
    const claims: IdentityTokenClaims = {
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
      sub: userId,
      name,
      avatarUrl: user.avatarUrl,
      iat: issuedAt,
      exp: expiresAt,
      jti: randomUUID(),
    }
    const payloadSegment = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
    const signatureSegment = sign(payloadSegment).toString('base64url')

    return {
      authToken: `${TOKEN_PREFIX}.${payloadSegment}.${signatureSegment}`,
      authTokenExpiresAt: new Date(expiresAt * 1000).toISOString(),
    }
  }

  const verify = (authToken: string): IdentityTokenVerificationResult => {
    if (!authToken || authToken.length > MAX_TOKEN_LENGTH) {
      return { ok: false, reason: 'invalid' }
    }

    const segments = authToken.split('.')
    if (segments.length !== 3 || segments[0] !== TOKEN_PREFIX) {
      return { ok: false, reason: 'invalid' }
    }

    const payloadSegment = segments[1]
    const signatureSegment = segments[2]
    if (!payloadSegment || !signatureSegment) {
      return { ok: false, reason: 'invalid' }
    }

    const signature = decodeCanonicalBase64Url(signatureSegment)
    const expectedSignature = sign(payloadSegment)
    if (
      !signature ||
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(signature, expectedSignature)
    ) {
      return { ok: false, reason: 'invalid' }
    }

    const payload = decodeCanonicalBase64Url(payloadSegment)
    if (!payload || payload.length > MAX_PAYLOAD_LENGTH) {
      return { ok: false, reason: 'invalid' }
    }

    let claims: unknown
    try {
      claims = JSON.parse(payload.toString('utf8'))
    } catch {
      return { ok: false, reason: 'invalid' }
    }

    if (!isIdentityTokenClaims(claims)) {
      return { ok: false, reason: 'invalid' }
    }

    if (
      claims.iat <= 0 ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > MAX_IDENTITY_TOKEN_TTL_SECONDS
    ) {
      return { ok: false, reason: 'invalid' }
    }

    const now = Math.floor(Date.now() / 1000)
    if (claims.iat > now + CLOCK_SKEW_SECONDS) {
      return { ok: false, reason: 'invalid' }
    }

    if (claims.exp <= now) {
      return { ok: false, reason: 'expired' }
    }

    return { ok: true, claims }
  }

  return { issue, verify }
}
