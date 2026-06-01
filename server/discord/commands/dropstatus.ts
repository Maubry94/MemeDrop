import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js'
import type { ConnectedUser } from '../../../shared/types.js'
import { resolveConnectedUserName } from './shared.js'
import type { MemeDropCommand } from './types.js'

const formatConnectedUserStatus = (user: ConnectedUser) => {
  const connections = user.connections > 1 ? ` · ${user.connections} connexions` : ''
  const version = user.appVersions.length ? ` · v${user.appVersions.join(', v')}` : ''
  return `${user.dropsEnabled ? 'Drops activés' : 'Drops désactivés'}${connections}${version}`
}

export const dropStatusCommand: MemeDropCommand = {
  data: new SlashCommandBuilder()
    .setName('dropstatus')
    .setDescription('Voir les utilisateurs connectés à MemeDrop'),
  execute: async (interaction, { getConnectedUsers }) => {
    const users = getConnectedUsers().filter((user) => user.id !== interaction.user.id)

    if (!users.length) {
      await interaction.reply({
        content: 'Aucun autre utilisateur connecté à MemeDrop.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const resolvedUsers = await Promise.all(
      users.map(async (user) => ({
        ...user,
        name: await resolveConnectedUserName(interaction, user),
      })),
    )
    const availableUsers = resolvedUsers.filter((user) => user.dropsEnabled)
    const unavailableUsers = resolvedUsers.filter((user) => !user.dropsEnabled)

    const formatUserLines = (items: ConnectedUser[]) =>
      items.map((user) => `• **${user.name}**\n${formatConnectedUserStatus(user)}`).join('\n')

    const embed = new EmbedBuilder()
      .setTitle('Utilisateurs MemeDrop')
      .setColor(availableUsers.length ? 0x34d399 : 0xf59e0b)
      .setDescription(
        availableUsers.length
          ? `${availableUsers.length} utilisateur(s) disponible(s) pour recevoir un drop.`
          : 'Aucun utilisateur disponible pour recevoir un drop.',
      )

    if (availableUsers.length) {
      embed.addFields({
        name: 'Disponibles',
        value: formatUserLines(availableUsers).slice(0, 1024),
      })
    }

    if (unavailableUsers.length) {
      embed.addFields({
        name: 'Connectés, drops désactivés',
        value: formatUserLines(unavailableUsers).slice(0, 1024),
      })
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    })
  },
}
