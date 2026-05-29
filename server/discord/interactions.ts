import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  type AutocompleteInteraction,
  User,
  type Interaction,
} from 'discord.js'
import type { ConnectedUser, Drop } from '../../shared/types.js'
import type { BroadcastDrop, GetConnectedUsers, StopDropByOwner } from '../types.js'
import { isSupportedAttachment } from '../utils/attachments.js'
import { getYouTubeVideoId, isValidYouTubeVideoId } from '../utils/youtube.js'

const SUPPORTED_COMMANDS = new Set(['drop', 'dropyt', 'dropstatus', 'download'])

type BaseDrop = Omit<Drop, 'id' | 'url' | 'contentType' | 'fileName' | 'youtubeVideoId' | 'targetUserId' | 'targetUserName'>

type DropTarget = {
  id: string
  name: string
}

type DiscordApiErrorLike = {
  code?: number
}

const getUserAvatarUrl = (user: User): string =>
  user.displayAvatarURL({
    extension: 'png',
    size: 128,
  })

const createBaseDrop = (
  interaction: ChatInputCommandInteraction,
  caption: string | null,
  isAnonymous: boolean,
): BaseDrop => ({
  caption: caption || null,
  authorId: isAnonymous ? null : interaction.user.id,
  ownerId: interaction.user.id,
  isAnonymous,
  author: isAnonymous ? 'anonymement' : (interaction.user.username ?? null),
  authorAvatarUrl: isAnonymous ? null : getUserAvatarUrl(interaction.user),
  createdAt: new Date().toISOString(),
})

const createStopButtonComponents = (dropId: string) => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`stop-drop:${dropId}`)
      .setLabel('Stopper le drop')
      .setStyle(ButtonStyle.Danger),
  ),
]

const getReleaseUrl = (version: string) =>
  `https://github.com/Maubry94/MemeDrop/releases/tag/${version}`

const createDownloadButtonComponents = (latestAppVersion: string) => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Télécharger MemeDrop')
      .setStyle(ButtonStyle.Link)
      .setURL(getReleaseUrl(latestAppVersion)),
  ),
]

const getAvailableDropTargets = (getConnectedUsers: GetConnectedUsers, requesterId?: string) =>
  getConnectedUsers()
    .filter((user) => user.dropsEnabled && user.id !== requesterId)
    .sort((a, b) => a.name.localeCompare(b.name))

const getTargetUser = async (
  interaction: ChatInputCommandInteraction,
  getConnectedUsers: GetConnectedUsers,
): Promise<DropTarget | null> => {
  const targetUserId = interaction.options.getString('cible')

  if (!targetUserId) {
    return null
  }

  const targetUser = getAvailableDropTargets(getConnectedUsers, interaction.user.id).find(
    (user) => user.id === targetUserId,
  )

  if (!targetUser) {
    return null
  }

  return {
    id: targetUser.id,
    name: await resolveConnectedUserName(interaction, targetUser),
  }
}

const withTarget = (drop: Drop, targetUser: DropTarget | null): Drop => ({
  ...drop,
  targetUserId: targetUser?.id ?? null,
  targetUserName: targetUser?.name ?? null,
})

const createSentMessage = (sentCount: number, targetUser: DropTarget | null): string => {
  if (!sentCount && targetUser) {
    return `Aucun client MemeDrop connecté pour ${targetUser.name}.`
  }

  if (!sentCount) {
    return 'Aucun client MemeDrop connecté.'
  }

  return targetUser ? `Drop envoyé à ${targetUser.name} !` : 'Drop envoyé !'
}

const editDropReply = async (
  interaction: ChatInputCommandInteraction,
  dropId: string,
  sentCount: number,
  targetUser: DropTarget | null,
  fallbackMessage: string,
) => {
  if (!sentCount) {
    await interaction.editReply(createSentMessage(sentCount, targetUser))
    return
  }

  await interaction.editReply({
    content: targetUser ? createSentMessage(sentCount, targetUser) : fallbackMessage,
    components: createStopButtonComponents(dropId),
  })
}

const handleYouTubeDrop = async (
  interaction: ChatInputCommandInteraction,
  caption: string | null,
  isAnonymous: boolean,
  broadcastDrop: BroadcastDrop,
  getConnectedUsers: GetConnectedUsers,
) => {
  const link = interaction.options.getString('lien', true)
  const youtubeVideoId = getYouTubeVideoId(link)
  const hasTarget = Boolean(interaction.options.getString('cible'))
  const targetUser = await getTargetUser(interaction, getConnectedUsers)

  if (hasTarget && !targetUser) {
    await interaction.editReply("Cette personne n'est plus disponible pour recevoir un drop.")
    return
  }

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

const handleFileDrop = async (
  interaction: ChatInputCommandInteraction,
  caption: string | null,
  isAnonymous: boolean,
  broadcastDrop: BroadcastDrop,
  getConnectedUsers: GetConnectedUsers,
) => {
  const attachment = interaction.options.getAttachment('fichier')
  const hasTarget = Boolean(interaction.options.getString('cible'))
  const targetUser = await getTargetUser(interaction, getConnectedUsers)

  if (!attachment) {
    await interaction.editReply('Pas de fichier fourni.')
    return
  }

  if (hasTarget && !targetUser) {
    await interaction.editReply("Cette personne n'est plus disponible pour recevoir un drop.")
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

const handleStopButton = async (
  interaction: Interaction,
  stopDropByOwner: StopDropByOwner,
): Promise<boolean> => {
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

const resolveConnectedUserName = async (
  interaction: ChatInputCommandInteraction,
  user: ConnectedUser,
): Promise<string> => {
  if (user.name && user.name !== user.id) {
    return user.name
  }

  try {
    const discordUser = await interaction.client.users.fetch(user.id)
    return discordUser.globalName ?? discordUser.username ?? user.id
  } catch {
    return user.id
  }
}

const handleDropStatus = async (
  interaction: ChatInputCommandInteraction,
  getConnectedUsers: GetConnectedUsers,
) => {
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

  const lines = resolvedUsers.map((user) => {
    const suffix = user.connections > 1 ? ` (${user.connections} connexions)` : ''
    return `- ${user.name}${suffix}`
  })

  await interaction.reply({
    content: `Utilisateurs connectés à MemeDrop :\n${lines.join('\n')}`,
    flags: MessageFlags.Ephemeral,
  })
}

const handleDownload = async (
  interaction: ChatInputCommandInteraction,
  latestAppVersion: string,
) => {
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
}

const handleTargetAutocomplete = async (
  interaction: AutocompleteInteraction,
  getConnectedUsers: GetConnectedUsers,
) => {
  if (!SUPPORTED_COMMANDS.has(interaction.commandName)) {
    return false
  }

  const focusedOption = interaction.options.getFocused(true)

  if (focusedOption.name !== 'cible') {
    return false
  }

  const search = String(focusedOption.value).trim().toLowerCase()
  const users = getAvailableDropTargets(getConnectedUsers, interaction.user.id)
  const matchingUsers = users
    .filter((user) => {
      const name = user.name.toLowerCase()
      return !search || name.includes(search) || user.id.includes(search)
    })
    .slice(0, 25)

  await interaction.respond(
    matchingUsers.map((user) => ({
      name: user.name,
      value: user.id,
    })),
  )

  return true
}

export const createInteractionHandler =
  ({
    latestAppVersion,
    broadcastDrop,
    getConnectedUsers,
    stopDropByOwner,
  }: {
    latestAppVersion: string
    broadcastDrop: BroadcastDrop
    getConnectedUsers: GetConnectedUsers
    stopDropByOwner: StopDropByOwner
  }) =>
  async (interaction: Interaction) => {
  if (await handleStopButton(interaction, stopDropByOwner)) {
    return
  }

  if (interaction.isAutocomplete()) {
    await handleTargetAutocomplete(interaction, getConnectedUsers)
    return
  }

  if (!interaction.isChatInputCommand() || !SUPPORTED_COMMANDS.has(interaction.commandName)) {
    return
  }

  console.log(`Commande /${interaction.commandName} reçue de ${interaction.user.tag}.`)

  try {
    if (interaction.commandName === 'dropstatus') {
      await handleDropStatus(interaction, getConnectedUsers)
      return
    }

    if (interaction.commandName === 'download') {
      await handleDownload(interaction, latestAppVersion)
      return
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    })

    const caption = interaction.options.getString('legende')
    const isAnonymous = interaction.options.getBoolean('anonyme') ?? false

    if (interaction.commandName === 'dropyt') {
      await handleYouTubeDrop(interaction, caption, isAnonymous, broadcastDrop, getConnectedUsers)
      return
    }

    await handleFileDrop(interaction, caption, isAnonymous, broadcastDrop, getConnectedUsers)
  } catch (error) {
    if ((error as DiscordApiErrorLike)?.code === 10062) {
      console.error(
        `Interaction Discord inconnue pour /${interaction.commandName}. Le drop n'a pas été ajouté à la queue. Vérifie qu'un seul serveur MemeDrop utilise ce bot et que le serveur répond en moins de 3 secondes.`,
      )
      return
    }

    console.error('Erreur lors du traitement de /drop:', error)
  }
}
