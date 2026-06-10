import { MessageFlags, type Interaction } from 'discord.js'
import type { BroadcastDrop, GetConnectedUsers, StopDropByOwner } from '../types.js'
import { discordCommandsByName } from './commands/index.js'
import {
  createInfoEmbed,
  editErrorReply,
  getAvailableDropTargets,
  getCooldownRemainingSeconds,
  userHasAllowedRole,
} from './commands/shared.js'
import type { DiscordCommandContext, RecentDrop } from './commands/types.js'

type DiscordApiErrorLike = {
  code?: number
}

const handleStopButton = async (
  interaction: Interaction,
  stopDropByOwner: StopDropByOwner,
): Promise<boolean> => {
  if (!interaction.isButton() || !interaction.customId.startsWith('stop-drop:')) {
    return false
  }

  const dropId = interaction.customId.slice('stop-drop:'.length)
  const stopped = stopDropByOwner(dropId, interaction.user.id)

  await interaction.update({
    embeds: [
      createInfoEmbed({
        title: stopped ? 'Drop stoppé' : 'Drop introuvable',
        description: stopped
          ? 'Le drop a été stoppé pour toutes les personnes qui l’avaient reçu.'
          : 'Ce drop est déjà terminé ou n’est plus dans la queue.',
        color: stopped ? 0x34d399 : 0xf59e0b,
      }),
    ],
    components: [],
  })

  return true
}

const handleTargetAutocomplete = async (
  interaction: Interaction,
  context: DiscordCommandContext,
) => {
  if (!interaction.isAutocomplete()) {
    return false
  }

  const command = discordCommandsByName.get(interaction.commandName)

  if (!command) {
    return false
  }

  if (command.autocomplete && await command.autocomplete(interaction, context)) {
    return true
  }

  const focusedOption = interaction.options.getFocused(true)

  if (focusedOption.name !== 'cible') {
    return false
  }

  const search = String(focusedOption.value).trim().toLowerCase()
  const users = getAvailableDropTargets(context.getConnectedUsers, interaction.user.id)
  const matchingUsers = users
    .filter((user) => {
      const name = user.name.toLowerCase()
      return !search || name.includes(search) || user.id.includes(search)
    })
    .slice(0, 25)

  await interaction.respond(
    matchingUsers.map((user) => ({
      name: user.name,
      value: user.id,
    })),
  )

  return true
}

export const createInteractionHandler =
  ({
    latestAppVersion,
    publicBaseUrl,
    allowedRoleIds,
    allowedChannelIds,
    dropCooldownSeconds,
    broadcastDrop,
    getConnectedUsers,
    stopDropByOwner,
  }: {
    latestAppVersion: string
    publicBaseUrl?: string
    allowedRoleIds: string[]
    allowedChannelIds: string[]
    dropCooldownSeconds: number
    broadcastDrop: BroadcastDrop
    getConnectedUsers: GetConnectedUsers
    stopDropByOwner: StopDropByOwner
  }) => {
  const cooldowns = new Map<string, number>()
  const recentDrops: RecentDrop[] = []

  const context: DiscordCommandContext = {
    latestAppVersion,
    publicBaseUrl,
    allowedRoleIds,
    dropCooldownSeconds,
    cooldowns,
    recentDrops,
    broadcastDrop,
    getConnectedUsers,
    stopDropByOwner,
  }

  return async (interaction: Interaction) => {
    if (await handleStopButton(interaction, stopDropByOwner)) {
      return
    }

    if (await handleTargetAutocomplete(interaction, context)) {
      return
    }

    if (!interaction.isChatInputCommand()) {
      return
    }

    const command = discordCommandsByName.get(interaction.commandName)

    if (!command) {
      return
    }

    console.log(`Commande /${interaction.commandName} reçue de ${interaction.user.tag}.`)

    try {
      if (!command.isDropCommand) {
        if (allowedChannelIds.length && !allowedChannelIds.includes(interaction.channelId)) {
          await interaction.reply({
            embeds: [
              createInfoEmbed({
                title: 'Commande non autorisée ici',
                description: 'Les commandes MemeDrop ne sont pas activées dans ce salon.',
                color: 0xf59e0b,
              }),
            ],
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        await command.execute(interaction, context)
        return
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      })

      if (allowedChannelIds.length && !allowedChannelIds.includes(interaction.channelId)) {
        await editErrorReply(
          interaction,
          'Commande non autorisée ici',
          'Les commandes MemeDrop ne sont pas activées dans ce salon.',
        )
        return
      }

      if (!userHasAllowedRole(interaction, allowedRoleIds)) {
        await editErrorReply(
          interaction,
          'Drop non autorisé',
          "Tu n'as pas le rôle requis pour envoyer des drops.",
        )
        return
      }

      const remainingCooldown = getCooldownRemainingSeconds(
        interaction.user.id,
        dropCooldownSeconds,
        cooldowns,
      )

      if (remainingCooldown > 0) {
        await editErrorReply(
          interaction,
          'Cooldown actif',
          `Tu pourras renvoyer un drop dans ${remainingCooldown} seconde(s).`,
        )
        return
      }

      const wasSent = await command.execute(interaction, context)

      if (wasSent) {
        cooldowns.set(interaction.user.id, Date.now())
      }
    } catch (error) {
      if ((error as DiscordApiErrorLike)?.code === 10062) {
        console.error(
          `Interaction Discord inconnue pour /${interaction.commandName}. Le drop n'a pas été ajouté à la queue. Vérifie qu'un seul serveur MemeDrop utilise ce bot et que le serveur répond en moins de 3 secondes.`,
        )
        return
      }

      console.error(`Erreur lors du traitement de /${interaction.commandName}:`, error)
    }
  }
}
