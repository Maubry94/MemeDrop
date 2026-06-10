import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js'
import { createDownloadButtonComponents } from './shared.js'
import type { MemeDropCommand } from './types.js'

export const helpCommand: MemeDropCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Afficher l’aide des commandes MemeDrop'),
  execute: async (interaction, { latestAppVersion }) => {
    const embed = new EmbedBuilder()
      .setTitle('Aide MemeDrop')
      .setDescription(
        'MemeDrop envoie les memes postés depuis Discord vers les overlays desktop des personnes connectées.',
      )
      .setColor(0x38bdf8)
      .addFields(
        {
          name: 'Envoyer',
          value:
            '`/drop` fichier\n`/dropme` fichier pour toi\n`/dropyt` vidéo YouTube\n`/droptt` vidéo TikTok\n`/redrop` drop récent',
        },
        {
          name: 'Infos',
          value: '`/dropstatus` utilisateurs disponibles\n`/download` télécharger l’app',
        },
        {
          name: 'Options communes',
          value:
            '`legende` ajoute un texte. `cible` propose les utilisateurs connectés avec les drops activés. `anonyme` masque ton pseudo et ton avatar.',
        },
        {
          name: 'Contrôler',
          value: 'Le bouton `Stopper le drop` arrête ton drop envoyé tant qu’il est en cours.',
        },
      )
      .setFooter({ text: `Dernière version MemeDrop : ${latestAppVersion}` })

    await interaction.reply({
      embeds: [embed],
      components: createDownloadButtonComponents(latestAppVersion),
      flags: MessageFlags.Ephemeral,
    })
  },
}
