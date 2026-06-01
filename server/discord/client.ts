import { Client, GatewayIntentBits } from 'discord.js'
import { registerSlashCommands } from './commands.js'
import { discordCommands } from './commands/index.js'
import { createInteractionHandler } from './interactions.js'
import type { DiscordBotOptions } from '../types.js'

export const createDiscordBot = ({
  token,
  guildId,
  latestAppVersion,
  allowedRoleIds,
  dropCooldownSeconds,
  broadcastDrop,
  getConnectedUsers,
  stopDropByOwner,
  onStatusChange,
}: DiscordBotOptions) => {
  if (!token || !guildId) {
    console.error('DISCORD_BOT_TOKEN et DISCORD_GUILD_ID sont requis.')
    process.exitCode = 1
    return null
  }

  const discord = new Client({
    intents: [GatewayIntentBits.Guilds],
  })

  discord.once('clientReady', async () => {
    onStatusChange('connected')
    console.log(`Discord connecté en tant que ${discord.user?.tag ?? 'bot'}.`)
    discord.user?.setActivity('Regarde les memes 👀')

    if (discord.user) {
      await registerSlashCommands(token, guildId, discord.user.id)
      console.log(
        `Commandes ${discordCommands.map((command) => `/${command.data.name}`).join(', ')} enregistrées.`,
      )
    }
  })

  discord.on(
    'interactionCreate',
    createInteractionHandler({
      latestAppVersion,
      allowedRoleIds,
      dropCooldownSeconds,
      broadcastDrop,
      getConnectedUsers,
      stopDropByOwner,
    }),
  )

  discord.on('error', (error) => {
    onStatusChange('error')
    console.error('Erreur Discord:', error)
  })

  discord.login(token).catch((error) => {
    onStatusChange('error')
    console.error('Login Discord impossible:', error)
  })

  return discord
}
