import { config as loadEnv } from 'dotenv'

loadEnv({ quiet: true })

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
  memedropUpdatesDir: string | undefined
  memedropLegacyUpdatesDir: string | undefined
  publicBaseUrl: string | undefined
} = {
  host: process.env.MEMEDROP_SERVER_HOST?.trim() || '0.0.0.0',
  port: Number(process.env.PORT ?? 3010),
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
  memedropDropCooldownSeconds: Number(process.env.MEMEDROP_DROP_COOLDOWN_SECONDS ?? 0),
  memedropServerKey: process.env.MEMEDROP_SERVER_KEY ?? '',
  memedropUpdatesDir: process.env.MEMEDROP_UPDATES_DIR?.trim() || undefined,
  memedropLegacyUpdatesDir:
    process.env.MEMEDROP_LEGACY_UPDATES_DIR?.trim() || undefined,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
}
