import { Client, GatewayIntentBits } from 'discord.js'
import { registerSlashCommands } from './commands.js'
import { discordCommands } from './commands/index.js'
import { createInteractionHandler } from './interactions.js'
import type { DiscordBotOptions } from '../types.js'

export const createDiscordBot = ({
  token,
  clientId,
  guildId,
  publicBaseUrl,
  latestAppVersion,
  allowedRoleIds,
  allowedChannelIds,
  dropCooldownSeconds,
  broadcastDrop,
  getConnectedUsers,
  stopDropByOwner,
  onStatusChange,
}: DiscordBotOptions) => {
  if (!token || !clientId || !guildId) {
    console.error('DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID et DISCORD_GUILD_ID sont requis.')
    process.exitCode = 1
    return null
  }

  const discord = new Client({
    intents: [GatewayIntentBits.Guilds],
  })
  const failInitialization = async (message: string, error?: unknown) => {
    onStatusChange('error')
    console.error(message, error ?? '')
    await discord.destroy()
  }
  const interactionHandler = createInteractionHandler({
    latestAppVersion,
    publicBaseUrl,
    allowedRoleIds,
    allowedChannelIds,
    dropCooldownSeconds,
    broadcastDrop,
    getConnectedUsers,
    stopDropByOwner,
  })

  discord.once('clientReady', async () => {
    if (!discord.user || discord.user.id !== clientId) {
      await failInitialization(
        "Le token du bot Discord n'appartient pas à l'application configurée par DISCORD_CLIENT_ID.",
      )
      return
    }

    try {
      discord.user.setActivity('Regarde les memes 👀')
      await registerSlashCommands(token, guildId, clientId)
      discord.on('interactionCreate', async (interaction) => {
        if (interaction.guildId !== guildId) {
          return
        }
        await interactionHandler(interaction)
      })
      onStatusChange('connected')
      console.log(`Discord connecté en tant que ${discord.user.tag}.`)
      console.log(
        `Commandes ${discordCommands.map((command) => `/${command.data.name}`).join(', ')} enregistrées.`,
      )
    } catch (error) {
      await failInitialization("Initialisation du bot Discord impossible :", error)
    }
  })

  discord.on('error', (error) => {
    onStatusChange('error')
    console.error('Erreur Discord:', error)
  })

  discord.login(token).catch((error) => {
    void failInitialization('Login Discord impossible :', error)
  })

  return discord
}
