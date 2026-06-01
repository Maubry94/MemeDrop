import { SlashCommandBuilder } from 'discord.js'
import { isSupportedAttachment } from '../../utils/attachments.js'
import {
  createBaseDrop,
  editDropReplyAndRemember,
  editErrorReply,
  getTargetUser,
  withTarget,
} from './shared.js'
import type { MemeDropCommand } from './types.js'

export const dropCommand: MemeDropCommand = {
  data: new SlashCommandBuilder()
    .setName('drop')
    .setDescription('Envoyer un meme via MemeDrop')
    .addAttachmentOption((option) =>
      option
        .setName('fichier')
        .setDescription('Image, vidéo, son ou fichier')
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
    const attachment = interaction.options.getAttachment('fichier')
    const caption = interaction.options.getString('legende')
    const isAnonymous = interaction.options.getBoolean('anonyme') ?? false
    const hasTarget = Boolean(interaction.options.getString('cible'))
    const targetUser = await getTargetUser(interaction, getConnectedUsers)

    if (!attachment) {
      await editErrorReply(
        interaction,
        'Fichier manquant',
        'Ajoute une image, une vidéo, un son ou un fichier pris en charge.',
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

    if (!isSupportedAttachment(attachment)) {
      await editErrorReply(
        interaction,
        'Format non supporté',
        'Envoie une image, une vidéo ou un son pris en charge par MemeDrop.',
      )
      return false
    }

    const drop = withTarget({
      id: attachment.id,
      url: attachment.url,
      contentType: attachment.contentType ?? null,
      fileName: attachment.name ?? null,
      ...createBaseDrop(interaction, caption, isAnonymous),
    }, targetUser)
    const sentCount = broadcastDrop(drop)

    console.log(`Drop fichier diffusé à ${sentCount} client(s): ${attachment.name ?? attachment.id}.`)
    return editDropReplyAndRemember(
      interaction,
      drop,
      sentCount,
      targetUser,
      'Drop envoyé',
      recentDrops,
    )
  },
}
