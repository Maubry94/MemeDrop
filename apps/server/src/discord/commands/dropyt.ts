import { SlashCommandBuilder } from 'discord.js'
import { resolveYouTubeVideo } from '../../utils/youtube.js'
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
    .setDescription('Envoyer une vidéo ou un clip YouTube via MemeDrop')
    .addStringOption((option) =>
      option
        .setName('lien')
        .setDescription('Lien d’une vidéo ou d’un clip YouTube')
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

    const youtubeVideo = await resolveYouTubeVideo(link)

    if (!youtubeVideo) {
      await editErrorReply(
        interaction,
        'Lien YouTube indisponible',
        'Vérifie que le lien pointe vers une vidéo ou un clip YouTube public.',
      )
      return false
    }

    const dropId = `youtube-${youtubeVideo.id}-${Date.now()}`
    const drop = withTarget({
      id: dropId,
      url: youtubeVideo.url,
      contentType: 'video/youtube',
      fileName: null,
      youtubeVideoId: youtubeVideo.clip ? null : youtubeVideo.id,
      youtubeClip: youtubeVideo.clip,
      ...createBaseDrop(interaction, caption, isAnonymous),
    }, targetUser)
    const sentCount = broadcastDrop(drop)

    console.log(
      `Drop YouTube diffusé à ${sentCount} client(s): ${youtubeVideo.clip?.id ?? youtubeVideo.id}.`,
    )
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
