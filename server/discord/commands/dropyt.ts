import { SlashCommandBuilder } from 'discord.js'
import { getYouTubeVideoId, isValidYouTubeVideoId } from '../../utils/youtube.js'
import {
  createBaseDrop,
  editDropReplyAndRemember,
  editErrorReply,
  getTargetUser,
  withTarget,
} from './shared.js'
import type { MemeDropCommand } from './types.js'

export const dropYouTubeCommand: MemeDropCommand = {
  data: new SlashCommandBuilder()
    .setName('dropyt')
    .setDescription('Envoyer une vidéo YouTube via MemeDrop')
    .addStringOption((option) =>
      option
        .setName('lien')
        .setDescription('Lien YouTube')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('legende')
        .setDescription('Légende optionnelle')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('cible')
        .setDescription('Envoyer le drop uniquement à cette personne')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addBooleanOption((option) =>
      option
        .setName('anonyme')
        .setDescription('Masquer ton pseudo et ton avatar sur le drop')
        .setRequired(false),
    ),
  isDropCommand: true,
  execute: async (interaction, { broadcastDrop, getConnectedUsers, recentDrops }) => {
    const link = interaction.options.getString('lien', true)
    const youtubeVideoId = getYouTubeVideoId(link)
    const caption = interaction.options.getString('legende')
    const isAnonymous = interaction.options.getBoolean('anonyme') ?? false
    const hasTarget = Boolean(interaction.options.getString('cible'))
    const targetUser = await getTargetUser(interaction, getConnectedUsers)

    if (hasTarget && !targetUser) {
      await editErrorReply(
        interaction,
        'Cible indisponible',
        'La personne doit être connectée à MemeDrop avec les drops activés.',
      )
      return false
    }

    if (!youtubeVideoId || !isValidYouTubeVideoId(youtubeVideoId)) {
      await editErrorReply(
        interaction,
        'Lien YouTube invalide',
        'Vérifie que le lien pointe vers une vidéo YouTube publique.',
      )
      return false
    }

    const dropId = `youtube-${youtubeVideoId}-${Date.now()}`
    const drop = withTarget({
      id: dropId,
      url: link,
      contentType: 'video/youtube',
      fileName: null,
      youtubeVideoId,
      ...createBaseDrop(interaction, caption, isAnonymous),
    }, targetUser)
    const sentCount = broadcastDrop(drop)

    console.log(`Drop YouTube diffusé à ${sentCount} client(s): ${youtubeVideoId}.`)
    return editDropReplyAndRemember(
      interaction,
      drop,
      sentCount,
      targetUser,
      'Drop YouTube envoyé',
      recentDrops,
    )
  },
}
