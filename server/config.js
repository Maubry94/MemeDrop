import { config as loadEnv } from 'dotenv'

loadEnv()

export const config = {
  port: Number(process.env.PORT ?? 3010),
  discordBotToken: process.env.DISCORD_BOT_TOKEN,
  discordGuildId: process.env.DISCORD_GUILD_ID,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET,
  memedropServerKey: process.env.MEMEDROP_SERVER_KEY ?? '',
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
}
