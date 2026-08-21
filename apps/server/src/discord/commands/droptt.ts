import { SlashCommandBuilder } from 'discord.js'
import { resolveTikTokVideo } from '../../utils/tiktok.js'
import {
  createBaseDrop,
  editDropReplyAndRemember,
  editErrorReply,
  getTargetUser,
  withTarget,
} from './shared.js'
import type { MemeDropCommand } from './types.js'

export const dropTikTokCommand: MemeDropCommand = {
  data: new SlashCommandBuilder()
    .setName('droptt')
    .setDescription('Envoyer une vidéo TikTok via MemeDrop')
    .addStringOption((option) =>
      option
        .setName('lien')
        .setDescription('Lien TikTok')
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

    const tiktokVideo = await resolveTikTokVideo(link)

    if (!tiktokVideo) {
      await editErrorReply(
        interaction,
        'Lien TikTok indisponible',
        'Essaie avec le lien complet de la vidéo plutôt qu’un lien raccourci.',
      )
      return false
    }

    const dropId = `tiktok-${tiktokVideo.id}-${Date.now()}`
    const drop = withTarget({
      id: dropId,
      url: tiktokVideo.url,
      contentType: 'video/tiktok',
      fileName: null,
      tiktokVideoId: tiktokVideo.id,
      ...createBaseDrop(interaction, caption, isAnonymous),
    }, targetUser)
    const sentCount = broadcastDrop(drop)

    console.log(`Drop TikTok diffusé à ${sentCount} client(s): ${tiktokVideo.id}.`)
    return editDropReplyAndRemember(
      interaction,
      drop,
      sentCount,
      targetUser,
      'Drop TikTok envoyé',
      recentDrops,
    )
  },
}
