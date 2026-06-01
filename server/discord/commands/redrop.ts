import { SlashCommandBuilder } from 'discord.js'
import {
  editDropReplyAndRemember,
  editErrorReply,
  getTargetUser,
  withTarget,
} from './shared.js'
import type { MemeDropCommand } from './types.js'

export const redropCommand: MemeDropCommand = {
  data: new SlashCommandBuilder()
    .setName('redrop')
    .setDescription('Renvoyer un drop récent')
    .addStringOption((option) =>
      option
        .setName('drop')
        .setDescription('Drop récent à renvoyer')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('cible')
        .setDescription('Envoyer le drop uniquement à cette personne')
        .setRequired(false)
        .setAutocomplete(true),
    ),
  isDropCommand: true,
  execute: async (interaction, { broadcastDrop, getConnectedUsers, recentDrops }) => {
    const recentDropId = interaction.options.getString('drop', true)
    const recentDrop = recentDrops.find(
      (entry) => entry.id === recentDropId && entry.ownerId === interaction.user.id,
    )
    const hasTarget = Boolean(interaction.options.getString('cible'))
    const targetUser = await getTargetUser(interaction, getConnectedUsers)

    if (!recentDrop) {
      await editErrorReply(
        interaction,
        'Drop introuvable',
        "Ce drop n’est plus disponible dans ton historique récent.",
      )
      return false
    }

    if (hasTarget && !targetUser) {
      await editErrorReply(
        interaction,
        'Cible indisponible',
        'La personne doit être connectée à MemeDrop avec les drops activés.',
      )
      return false
    }

    const drop = withTarget({
      ...recentDrop.drop,
      id: `redrop-${recentDrop.drop.id}-${Date.now()}`,
      ownerId: interaction.user.id,
      createdAt: new Date().toISOString(),
    }, targetUser)
    const sentCount = broadcastDrop(drop)

    console.log(`Redrop diffusé à ${sentCount} client(s): ${recentDrop.drop.id}.`)
    return editDropReplyAndRemember(
      interaction,
      drop,
      sentCount,
      targetUser,
      'Drop renvoyé',
      recentDrops,
    )
  },
  autocomplete: async (interaction, { recentDrops }) => {
    const focusedOption = interaction.options.getFocused(true)

    if (focusedOption.name !== 'drop') {
      return false
    }

    const search = String(focusedOption.value).trim().toLowerCase()
    const matchingDrops = recentDrops
      .filter((drop) => drop.ownerId === interaction.user.id)
      .filter((drop) => !search || drop.label.toLowerCase().includes(search))
      .slice(0, 25)

    await interaction.respond(
      matchingDrops.map((drop) => ({
        name: drop.label,
        value: drop.id,
      })),
    )

    return true
  },
}
