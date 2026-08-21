import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js'
import {
  createHelpButtonComponents,
  getPublicGuideUrl,
} from './shared.js'
import type { MemeDropCommand } from './types.js'

export const helpCommand: MemeDropCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Afficher l’aide des commandes MemeDrop'),
  execute: async (interaction, { latestAppVersion, publicBaseUrl }) => {
    const guideUrl = getPublicGuideUrl(publicBaseUrl)
    const guideLine = guideUrl
      ? `Guide complet : [ouvrir la page web](${guideUrl})`
      : 'Guide complet : ouvre la page web du serveur MemeDrop.'

    const embed = new EmbedBuilder()
      .setTitle('MemeDrop')
      .setDescription(
        [
          'Envoie des memes depuis Discord vers les overlays desktop connectés.',
          guideLine,
        ].join('\n'),
      )
      .setColor(0x38bdf8)
      .addFields(
        {
          name: 'Envoyer un drop',
          value:
            [
              '`/drop` - fichier vers tout le monde ou une cible',
              '`/dropme` - fichier uniquement pour toi',
              '`/dropyt` - vidéo YouTube',
              '`/droptt` - vidéo TikTok',
              '`/redrop` - renvoyer un drop récent',
            ].join('\n'),
        },
        {
          name: 'Options utiles',
          value:
            [
              '`legende` - ajoute un texte sur le drop',
              '`cible` - choisit une personne connectée',
              '`anonyme` - masque ton pseudo et ton avatar',
            ].join('\n'),
        },
        {
          name: 'Suivre et gérer',
          value:
            [
              '`/dropstatus` - voir qui peut recevoir des drops',
              '`/download` - télécharger la dernière app desktop',
              '`Stopper le drop` - arrêter ton drop pendant sa diffusion',
            ].join('\n'),
        },
      )
      .setFooter({ text: `Dernière version MemeDrop : ${latestAppVersion}` })

    if (guideUrl) {
      embed.setURL(guideUrl)
    }

    await interaction.reply({
      embeds: [embed],
      components: createHelpButtonComponents(latestAppVersion, publicBaseUrl),
      flags: MessageFlags.Ephemeral,
    })
  },
}
