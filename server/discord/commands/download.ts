import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js'
import { createDownloadButtonComponents, getReleaseUrl } from './shared.js'
import type { MemeDropCommand } from './types.js'

export const downloadCommand: MemeDropCommand = {
  data: new SlashCommandBuilder()
    .setName('download')
    .setDescription('Télécharger la dernière version de MemeDrop'),
  execute: async (interaction, { latestAppVersion }) => {
    const releaseUrl = getReleaseUrl(latestAppVersion)
    const embed = new EmbedBuilder()
      .setTitle(`MemeDrop ${latestAppVersion}`)
      .setDescription(
        "Télécharge la dernière version de l'application desktop pour recevoir les drops sur ton PC.",
      )
      .setColor(0x38bdf8)
      .addFields({
        name: 'Dernière version',
        value: latestAppVersion,
        inline: true,
      })
      .setURL(releaseUrl)

    await interaction.reply({
      embeds: [embed],
      components: createDownloadButtonComponents(latestAppVersion),
      flags: MessageFlags.Ephemeral,
    })
  },
}
