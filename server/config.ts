import { config as loadEnv } from 'dotenv'
import {
  DEFAULT_IDENTITY_TOKEN_TTL_SECONDS,
  MAX_IDENTITY_TOKEN_TTL_SECONDS,
  MIN_IDENTITY_TOKEN_TTL_SECONDS,
} from './security/identityToken.js'

loadEnv({ quiet: true })

const getIntegerEnvironmentValue = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const rawValue = process.env[name]?.trim()
  if (!rawValue) {
    return fallback
  }

  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`)
  }

  return value
}

const getServerKey = () => {
  const serverKey = process.env.MEMEDROP_SERVER_KEY?.trim() ?? ''

  if (Buffer.byteLength(serverKey, 'utf8') < 16) {
    throw new Error('MEMEDROP_SERVER_KEY must contain at least 16 bytes.')
  }

  return serverKey
}

const getIdentityTokenTtlSeconds = () => {
  const configuredValue = process.env.MEMEDROP_IDENTITY_TOKEN_TTL_SECONDS?.trim()
  if (!configuredValue) {
    return DEFAULT_IDENTITY_TOKEN_TTL_SECONDS
  }

  const ttlSeconds = Number(configuredValue)
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < MIN_IDENTITY_TOKEN_TTL_SECONDS ||
    ttlSeconds > MAX_IDENTITY_TOKEN_TTL_SECONDS
  ) {
    throw new Error(
      `MEMEDROP_IDENTITY_TOKEN_TTL_SECONDS must be an integer between ${MIN_IDENTITY_TOKEN_TTL_SECONDS} and ${MAX_IDENTITY_TOKEN_TTL_SECONDS}.`,
    )
  }

  return ttlSeconds
}

export const config: {
  host: string
  port: number
  discordBotToken: string | undefined
  discordGuildId: string | undefined
  discordClientId: string | undefined
  discordClientSecret: string | undefined
  memedropAllowedRoleIds: string[]
  memedropAllowedChannelIds: string[]
  memedropDropCooldownSeconds: number
  memedropServerKey: string
  memedropIdentitySigningSecret: string
  memedropIdentityTokenTtlSeconds: number
  memedropUpdatesDir: string | undefined
  publicBaseUrl: string | undefined
} = {
  host: process.env.MEMEDROP_SERVER_HOST?.trim() || '0.0.0.0',
  port: getIntegerEnvironmentValue('PORT', 3010, 1, 65535),
  discordBotToken: process.env.DISCORD_BOT_TOKEN,
  discordGuildId: process.env.DISCORD_GUILD_ID,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET,
  memedropAllowedRoleIds: (process.env.MEMEDROP_ALLOWED_ROLE_IDS ?? '')
    .split(',')
    .map((roleId) => roleId.trim())
    .filter(Boolean),
  memedropAllowedChannelIds: (process.env.MEMEDROP_ALLOWED_CHANNEL_IDS ?? '')
    .split(',')
    .map((channelId) => channelId.trim())
    .filter(Boolean),
  memedropDropCooldownSeconds: getIntegerEnvironmentValue(
    'MEMEDROP_DROP_COOLDOWN_SECONDS',
    0,
    0,
    86_400,
  ),
  memedropServerKey: getServerKey(),
  memedropIdentitySigningSecret: process.env.MEMEDROP_IDENTITY_SIGNING_SECRET?.trim() ?? '',
  memedropIdentityTokenTtlSeconds: getIdentityTokenTtlSeconds(),
  memedropUpdatesDir: process.env.MEMEDROP_UPDATES_DIR?.trim() || undefined,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
}
