import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js'
import { isSupportedAttachment } from '../utils/attachments.js'
import { getYouTubeVideoId, isValidYouTubeVideoId } from '../utils/youtube.js'

const SUPPORTED_COMMANDS = new Set(['drop', 'dropyt'])

const getUserAvatarUrl = (user) =>
  user.displayAvatarURL({
    extension: 'png',
    size: 128,
  })

const createBaseDrop = (interaction, caption, isAnonymous) => ({
  caption: caption || null,
  authorId: isAnonymous ? null : interaction.user.id,
  ownerId: interaction.user.id,
  isAnonymous,
  author: isAnonymous ? 'anonymement' : (interaction.user.username ?? null),
  authorAvatarUrl: isAnonymous ? null : getUserAvatarUrl(interaction.user),
  createdAt: new Date().toISOString(),
})

const createStopButtonComponents = (dropId) => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`stop-drop:${dropId}`)
      .setLabel('Stopper le drop')
      .setStyle(ButtonStyle.Danger),
  ),
]

const getTargetUser = (interaction) => interaction.options.getUser('cible')

const withTarget = (drop, targetUser) => ({
  ...drop,
  targetUserId: targetUser?.id ?? null,
  targetUserName: targetUser?.username ?? null,
})

const createSentMessage = (sentCount, targetUser) => {
  if (!sentCount && targetUser) {
    return `Aucun client MemeDrop connecté pour ${targetUser.username}.`
  }

  if (!sentCount) {
    return 'Aucun client MemeDrop connecté.'
  }

  return targetUser ? `Drop envoyé à ${targetUser.username} !` : 'Drop envoyé !'
}

const editDropReply = async (interaction, dropId, sentCount, targetUser, fallbackMessage) => {
  if (!sentCount) {
    await interaction.editReply(createSentMessage(sentCount, targetUser))
    return
  }

  await interaction.editReply({
    content: targetUser ? createSentMessage(sentCount, targetUser) : fallbackMessage,
    components: createStopButtonComponents(dropId),
  })
}

const handleYouTubeDrop = async (interaction, caption, isAnonymous, broadcastDrop) => {
  const link = interaction.options.getString('lien', true)
  const youtubeVideoId = getYouTubeVideoId(link)
  const targetUser = getTargetUser(interaction)

  if (!youtubeVideoId || !isValidYouTubeVideoId(youtubeVideoId)) {
    await interaction.editReply('Lien YouTube invalide.')
    return
  }

  const dropId = `youtube-${youtubeVideoId}-${Date.now()}`
  const sentCount = broadcastDrop(withTarget({
    id: dropId,
    url: link,
    contentType: 'video/youtube',
    fileName: null,
    youtubeVideoId,
    ...createBaseDrop(interaction, caption, isAnonymous),
  }, targetUser))

  console.log(`Drop YouTube diffusé à ${sentCount} client(s): ${youtubeVideoId}.`)
  await editDropReply(interaction, dropId, sentCount, targetUser, 'Drop YouTube envoyé !')
}

const handleFileDrop = async (interaction, caption, isAnonymous, broadcastDrop) => {
  const attachment = interaction.options.getAttachment('fichier')
  const targetUser = getTargetUser(interaction)

  if (!attachment) {
    await interaction.editReply('Pas de fichier fourni.')
    return
  }

  if (!isSupportedAttachment(attachment)) {
    await interaction.editReply('Format non supporté. Envoie une image, une vidéo ou un son.')
    return
  }

  const sentCount = broadcastDrop(withTarget({
    id: attachment.id,
    url: attachment.url,
    contentType: attachment.contentType ?? null,
    fileName: attachment.name ?? null,
    ...createBaseDrop(interaction, caption, isAnonymous),
  }, targetUser))

  console.log(`Drop fichier diffusé à ${sentCount} client(s): ${attachment.name ?? attachment.id}.`)
  await editDropReply(interaction, attachment.id, sentCount, targetUser, 'Drop envoyé !')
}

const handleStopButton = async (interaction, stopDropByOwner) => {
  if (!interaction.isButton() || !interaction.customId.startsWith('stop-drop:')) {
    return false
  }

  const dropId = interaction.customId.slice('stop-drop:'.length)
  const stopped = stopDropByOwner(dropId, interaction.user.id)

  await interaction.update({
    content: stopped ? 'Drop stoppé.' : 'Drop déjà terminé ou introuvable.',
    components: [],
  })

  return true
}

export const createInteractionHandler = ({ broadcastDrop, stopDropByOwner }) => async (interaction) => {
  if (await handleStopButton(interaction, stopDropByOwner)) {
    return
  }

  if (!interaction.isChatInputCommand() || !SUPPORTED_COMMANDS.has(interaction.commandName)) {
    return
  }

  console.log(`Commande /${interaction.commandName} reçue de ${interaction.user.tag}.`)

  try {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    })

    const caption = interaction.options.getString('legende')
    const isAnonymous = interaction.options.getBoolean('anonyme') ?? false

    if (interaction.commandName === 'dropyt') {
      await handleYouTubeDrop(interaction, caption, isAnonymous, broadcastDrop)
      return
    }

    await handleFileDrop(interaction, caption, isAnonymous, broadcastDrop)
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
