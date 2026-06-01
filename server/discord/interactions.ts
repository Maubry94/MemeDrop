import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  type AutocompleteInteraction,
  type GuildMemberRoleManager,
  User,
  type Interaction,
} from 'discord.js'
import type { ConnectedUser, Drop } from '../../shared/types.js'
import type { BroadcastDrop, GetConnectedUsers, StopDropByOwner } from '../types.js'
import { isSupportedAttachment } from '../utils/attachments.js'
import { resolveTikTokVideo } from '../utils/tiktok.js'
import { getYouTubeVideoId, isValidYouTubeVideoId } from '../utils/youtube.js'

const SUPPORTED_COMMANDS = new Set(['drop', 'dropyt', 'droptt', 'redrop', 'dropstatus', 'download', 'help'])
const DROP_COMMANDS = new Set(['drop', 'dropyt', 'droptt', 'redrop'])
const RECENT_DROP_LIMIT = 25

type BaseDrop = Omit<Drop, 'id' | 'url' | 'contentType' | 'fileName' | 'youtubeVideoId' | 'tiktokVideoId' | 'targetUserId' | 'targetUserName'>

type DropTarget = {
  id: string
  name: string
}

type RecentDrop = {
  id: string
  ownerId: string
  label: string
  drop: Drop
  createdAt: number
}

type DiscordApiErrorLike = {
  code?: number
}

type DropReplyOptions = {
  title: string
  description: string
  color?: number
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

const createInfoEmbed = ({
  title,
  description,
  color = 0x38bdf8,
}: DropReplyOptions) =>
  new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)

const editErrorReply = (
  interaction: ChatInputCommandInteraction,
  title: string,
  description: string,
) =>
  interaction.editReply({
    embeds: [
      createInfoEmbed({
        title,
        description,
        color: 0xf43f5e,
      }),
    ],
  })

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

const getDropKindLabel = (drop: Drop) => {
  if (drop.contentType === 'video/youtube') return 'YouTube'
  if (drop.contentType === 'video/tiktok') return 'TikTok'
  if (drop.contentType?.startsWith('image/')) return 'Image'
  if (drop.contentType?.startsWith('video/')) return 'Vidéo'
  if (drop.contentType?.startsWith('audio/')) return 'Audio'
  return 'Drop'
}

const createRecentDropLabel = (drop: Drop) => {
  const title = drop.caption || drop.fileName || drop.url
  const target = drop.targetUserName ? ` -> ${drop.targetUserName}` : ''
  return `${getDropKindLabel(drop)} · ${title}${target}`.slice(0, 100)
}

const addRecentDrop = (recentDrops: RecentDrop[], drop: Drop) => {
  const ownerId = drop.ownerId ?? drop.authorId

  if (!ownerId) {
    return
  }

  recentDrops.unshift({
    id: `${drop.id}-${Date.now()}`,
    ownerId,
    label: createRecentDropLabel(drop),
    drop,
    createdAt: Date.now(),
  })

  recentDrops.splice(RECENT_DROP_LIMIT)
}

const userHasAllowedRole = (interaction: ChatInputCommandInteraction, allowedRoleIds: string[]) => {
  if (!allowedRoleIds.length) {
    return true
  }

  const roles = interaction.member?.roles as GuildMemberRoleManager | string[] | undefined

  if (Array.isArray(roles)) {
    return roles.some((roleId) => allowedRoleIds.includes(roleId))
  }

  return Boolean(roles?.cache.some((role) => allowedRoleIds.includes(role.id)))
}

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

const createDropSentEmbed = (
  drop: Drop,
  sentCount: number,
  targetUser: DropTarget | null,
  title: string,
) => {
  const embed = createInfoEmbed({
    title,
    description: 'Le drop a été ajouté à la queue MemeDrop.',
    color: 0x34d399,
  }).addFields(
    {
      name: 'Type',
      value: getDropKindLabel(drop),
      inline: true,
    },
    {
      name: 'Cible',
      value: targetUser?.name ?? 'Tout le monde',
      inline: true,
    },
    {
      name: 'Destinataires',
      value: String(sentCount),
      inline: true,
    },
  )

  if (drop.caption) {
    embed.addFields({
      name: 'Légende',
      value: drop.caption.slice(0, 1024),
    })
  }

  embed.setFooter({ text: 'Tu peux stopper ce drop tant qu’il est en cours.' })

  return embed
}

const editDropReply = async (
  interaction: ChatInputCommandInteraction,
  drop: Drop,
  sentCount: number,
  targetUser: DropTarget | null,
  fallbackMessage: string,
) => {
  if (!sentCount) {
    await editErrorReply(
      interaction,
      targetUser ? 'Cible indisponible' : 'Aucun destinataire',
      createSentMessage(sentCount, targetUser),
    )
    return
  }

  await interaction.editReply({
    embeds: [createDropSentEmbed(drop, sentCount, targetUser, fallbackMessage)],
    components: createStopButtonComponents(drop.id),
  })
}

const editDropReplyAndRemember = async (
  interaction: ChatInputCommandInteraction,
  drop: Drop,
  sentCount: number,
  targetUser: DropTarget | null,
  fallbackMessage: string,
  recentDrops: RecentDrop[],
) => {
  if (sentCount) {
    addRecentDrop(recentDrops, drop)
  }

  await editDropReply(interaction, drop, sentCount, targetUser, fallbackMessage)
  return sentCount > 0
}

const handleYouTubeDrop = async (
  interaction: ChatInputCommandInteraction,
  caption: string | null,
  isAnonymous: boolean,
  broadcastDrop: BroadcastDrop,
  getConnectedUsers: GetConnectedUsers,
  recentDrops: RecentDrop[],
) => {
  const link = interaction.options.getString('lien', true)
  const youtubeVideoId = getYouTubeVideoId(link)
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
}

const handleTikTokDrop = async (
  interaction: ChatInputCommandInteraction,
  caption: string | null,
  isAnonymous: boolean,
  broadcastDrop: BroadcastDrop,
  getConnectedUsers: GetConnectedUsers,
  recentDrops: RecentDrop[],
) => {
  const link = interaction.options.getString('lien', true)
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
}

const handleFileDrop = async (
  interaction: ChatInputCommandInteraction,
  caption: string | null,
  isAnonymous: boolean,
  broadcastDrop: BroadcastDrop,
  getConnectedUsers: GetConnectedUsers,
  recentDrops: RecentDrop[],
) => {
  const attachment = interaction.options.getAttachment('fichier')
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
}

const handleRedrop = async (
  interaction: ChatInputCommandInteraction,
  broadcastDrop: BroadcastDrop,
  getConnectedUsers: GetConnectedUsers,
  recentDrops: RecentDrop[],
) => {
  const recentDropId = interaction.options.getString('drop', true)
  const recentDrop = recentDrops.find(
    (entry) => entry.id === recentDropId && entry.ownerId === interaction.user.id,
  )
  const hasTarget = Boolean(interaction.options.getString('cible'))
  const targetUser = await getTargetUser(interaction, getConnectedUsers)

  if (!recentDrop) {
    await editErrorReply(
      interaction,
      'Drop introuvable',
      "Ce drop n’est plus disponible dans ton historique récent.",
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

  const drop = withTarget({
    ...recentDrop.drop,
    id: `redrop-${recentDrop.drop.id}-${Date.now()}`,
    ownerId: interaction.user.id,
    createdAt: new Date().toISOString(),
  }, targetUser)
  const sentCount = broadcastDrop(drop)

  console.log(`Redrop diffusé à ${sentCount} client(s): ${recentDrop.drop.id}.`)
  return editDropReplyAndRemember(
    interaction,
    drop,
    sentCount,
    targetUser,
    'Drop renvoyé',
    recentDrops,
  )
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
    embeds: [
      createInfoEmbed({
        title: stopped ? 'Drop stoppé' : 'Drop introuvable',
        description: stopped
          ? 'Le drop a été stoppé pour toutes les personnes qui l’avaient reçu.'
          : 'Ce drop est déjà terminé ou n’est plus dans la queue.',
        color: stopped ? 0x34d399 : 0xf59e0b,
      }),
    ],
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

const formatConnectedUserStatus = (user: ConnectedUser) => {
  const connections = user.connections > 1 ? ` · ${user.connections} connexions` : ''
  const version = user.appVersions.length ? ` · v${user.appVersions.join(', v')}` : ''
  return `${user.dropsEnabled ? 'Drops activés' : 'Drops désactivés'}${connections}${version}`
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
  const availableUsers = resolvedUsers.filter((user) => user.dropsEnabled)
  const unavailableUsers = resolvedUsers.filter((user) => !user.dropsEnabled)

  const formatUserLines = (items: ConnectedUser[]) =>
    items.map((user) => `• **${user.name}**\n${formatConnectedUserStatus(user)}`).join('\n')

  const embed = new EmbedBuilder()
    .setTitle('Utilisateurs MemeDrop')
    .setColor(availableUsers.length ? 0x34d399 : 0xf59e0b)
    .setDescription(
      availableUsers.length
        ? `${availableUsers.length} utilisateur(s) disponible(s) pour recevoir un drop.`
        : 'Aucun utilisateur disponible pour recevoir un drop.',
    )

  if (availableUsers.length) {
    embed.addFields({
      name: 'Disponibles',
      value: formatUserLines(availableUsers).slice(0, 1024),
    })
  }

  if (unavailableUsers.length) {
    embed.addFields({
      name: 'Connectés, drops désactivés',
      value: formatUserLines(unavailableUsers).slice(0, 1024),
    })
  }

  await interaction.reply({
    embeds: [embed],
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

const handleHelp = async (
  interaction: ChatInputCommandInteraction,
  latestAppVersion: string,
) => {
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
          '`/drop` fichier\n`/dropyt` vidéo YouTube\n`/droptt` vidéo TikTok\n`/redrop` drop récent',
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
}

const handleTargetAutocomplete = async (
  interaction: AutocompleteInteraction,
  getConnectedUsers: GetConnectedUsers,
  recentDrops: RecentDrop[],
) => {
  if (!SUPPORTED_COMMANDS.has(interaction.commandName)) {
    return false
  }

  const focusedOption = interaction.options.getFocused(true)

  if (focusedOption.name === 'drop' && interaction.commandName === 'redrop') {
    const search = String(focusedOption.value).trim().toLowerCase()
    const matchingDrops = recentDrops
      .filter((drop) => drop.ownerId === interaction.user.id)
      .filter((drop) => !search || drop.label.toLowerCase().includes(search))
      .slice(0, 25)

    await interaction.respond(
      matchingDrops.map((drop) => ({
        name: drop.label,
        value: drop.id,
      })),
    )

    return true
  }

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

const getCooldownRemainingSeconds = (
  userId: string,
  cooldownSeconds: number,
  cooldowns: Map<string, number>,
) => {
  if (cooldownSeconds <= 0) {
    return 0
  }

  const lastDropAt = cooldowns.get(userId)
  if (!lastDropAt) {
    return 0
  }

  const elapsedSeconds = Math.floor((Date.now() - lastDropAt) / 1000)
  return Math.max(0, cooldownSeconds - elapsedSeconds)
}

export const createInteractionHandler =
  ({
    latestAppVersion,
    allowedRoleIds,
    dropCooldownSeconds,
    broadcastDrop,
    getConnectedUsers,
    stopDropByOwner,
  }: {
    latestAppVersion: string
    allowedRoleIds: string[]
    dropCooldownSeconds: number
    broadcastDrop: BroadcastDrop
    getConnectedUsers: GetConnectedUsers
    stopDropByOwner: StopDropByOwner
  }) => {
  const cooldowns = new Map<string, number>()
  const recentDrops: RecentDrop[] = []

  return async (interaction: Interaction) => {
    if (await handleStopButton(interaction, stopDropByOwner)) {
      return
    }

    if (interaction.isAutocomplete()) {
      await handleTargetAutocomplete(interaction, getConnectedUsers, recentDrops)
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

      if (interaction.commandName === 'help') {
        await handleHelp(interaction, latestAppVersion)
        return
      }

      if (!DROP_COMMANDS.has(interaction.commandName)) {
        return
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      })

      if (!userHasAllowedRole(interaction, allowedRoleIds)) {
        await editErrorReply(
          interaction,
          'Drop non autorisé',
          "Tu n'as pas le rôle requis pour envoyer des drops.",
        )
        return
      }

      const remainingCooldown = getCooldownRemainingSeconds(
        interaction.user.id,
        dropCooldownSeconds,
        cooldowns,
      )

      if (remainingCooldown > 0) {
        await editErrorReply(
          interaction,
          'Cooldown actif',
          `Tu pourras renvoyer un drop dans ${remainingCooldown} seconde(s).`,
        )
        return
      }

      const caption = interaction.options.getString('legende')
      const isAnonymous = interaction.options.getBoolean('anonyme') ?? false

      if (interaction.commandName === 'dropyt') {
        const wasSent = await handleYouTubeDrop(
          interaction,
          caption,
          isAnonymous,
          broadcastDrop,
          getConnectedUsers,
          recentDrops,
        )
        if (wasSent) cooldowns.set(interaction.user.id, Date.now())
        return
      }

      if (interaction.commandName === 'droptt') {
        const wasSent = await handleTikTokDrop(
          interaction,
          caption,
          isAnonymous,
          broadcastDrop,
          getConnectedUsers,
          recentDrops,
        )
        if (wasSent) cooldowns.set(interaction.user.id, Date.now())
        return
      }

      if (interaction.commandName === 'redrop') {
        const wasSent = await handleRedrop(interaction, broadcastDrop, getConnectedUsers, recentDrops)
        if (wasSent) cooldowns.set(interaction.user.id, Date.now())
        return
      }

      const wasSent = await handleFileDrop(
        interaction,
        caption,
        isAnonymous,
        broadcastDrop,
        getConnectedUsers,
        recentDrops,
      )
      if (wasSent) cooldowns.set(interaction.user.id, Date.now())
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
}
