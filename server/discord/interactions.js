import { MessageFlags } from 'discord.js'
import { isSupportedAttachment } from '../utils/attachments.js'
import { getYouTubeVideoId, isValidYouTubeVideoId } from '../utils/youtube.js'

const SUPPORTED_COMMANDS = new Set(['drop', 'dropyt'])

const getUserAvatarUrl = (user) =>
  user.displayAvatarURL({
    extension: 'png',
    size: 128,
  })

const createBaseDrop = (interaction, caption) => ({
  caption: caption || null,
  authorId: interaction.user.id,
  author: interaction.user.username ?? null,
  authorAvatarUrl: getUserAvatarUrl(interaction.user),
  createdAt: new Date().toISOString(),
})

const handleYouTubeDrop = async (interaction, caption, broadcastDrop) => {
  const link = interaction.options.getString('lien', true)
  const youtubeVideoId = getYouTubeVideoId(link)

  if (!youtubeVideoId || !isValidYouTubeVideoId(youtubeVideoId)) {
    await interaction.editReply('Lien YouTube invalide.')
    return
  }

  const sentCount = broadcastDrop({
    id: `youtube-${youtubeVideoId}-${Date.now()}`,
    url: link,
    contentType: 'video/youtube',
    fileName: null,
    youtubeVideoId,
    ...createBaseDrop(interaction, caption),
  })

  console.log(`Drop YouTube diffusé à ${sentCount} client(s): ${youtubeVideoId}.`)
  await interaction.editReply('Drop YouTube envoyé !')
}

const handleFileDrop = async (interaction, caption, broadcastDrop) => {
  const attachment = interaction.options.getAttachment('fichier')

  if (!attachment) {
    await interaction.editReply('Pas de fichier fourni.')
    return
  }

  if (!isSupportedAttachment(attachment)) {
    await interaction.editReply('Format non supporté. Envoie une image, une vidéo ou un son.')
    return
  }

  const sentCount = broadcastDrop({
    id: attachment.id,
    url: attachment.url,
    contentType: attachment.contentType ?? null,
    fileName: attachment.name ?? null,
    ...createBaseDrop(interaction, caption),
  })

  console.log(`Drop fichier diffusé à ${sentCount} client(s): ${attachment.name ?? attachment.id}.`)
  await interaction.editReply('Drop envoyé !')
}

export const createInteractionHandler = ({ broadcastDrop }) => async (interaction) => {
  if (!interaction.isChatInputCommand() || !SUPPORTED_COMMANDS.has(interaction.commandName)) {
    return
  }

  console.log(`Commande /${interaction.commandName} reçue de ${interaction.user.tag}.`)

  try {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    })

    const caption = interaction.options.getString('legende')

    if (interaction.commandName === 'dropyt') {
      await handleYouTubeDrop(interaction, caption, broadcastDrop)
      return
    }

    await handleFileDrop(interaction, caption, broadcastDrop)
  } catch (error) {
    if (error?.code === 10062) {
      console.error(
        `Interaction Discord inconnue pour /${interaction.commandName}. Le drop n'a pas été ajouté à la queue. Vérifie qu'un seul serveur MemeDrop utilise ce bot et que le serveur répond en moins de 3 secondes.`,
      )
      return
    }

    console.error('Erreur lors du traitement de /drop:', error)
  }
}
