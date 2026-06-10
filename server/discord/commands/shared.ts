import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildMemberRoleManager,
  User,
} from 'discord.js'
import type { ConnectedUser, Drop } from '../../../shared/types.js'
import type { GetConnectedUsers } from '../../types.js'
import type { RecentDrop } from './types.js'

const RECENT_DROP_LIMIT = 25

type BaseDrop = Omit<
  Drop,
  | 'id'
  | 'url'
  | 'contentType'
  | 'fileName'
  | 'youtubeVideoId'
  | 'tiktokVideoId'
  | 'targetUserId'
  | 'targetUserName'
>

export type DropTarget = {
  id: string
  name: string
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

export const createBaseDrop = (
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

export const createStopButtonComponents = (dropId: string) => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`stop-drop:${dropId}`)
      .setLabel('Stopper le drop')
      .setStyle(ButtonStyle.Danger),
  ),
]

export const createInfoEmbed = ({
  title,
  description,
  color = 0x38bdf8,
}: DropReplyOptions) =>
  new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)

export const editErrorReply = (
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

export const getReleaseUrl = (version: string) =>
  `https://github.com/Maubry94/MemeDrop/releases/tag/${version}`

export const getPublicGuideUrl = (publicBaseUrl?: string) =>
  publicBaseUrl?.replace(/\/$/, '') || null

export const createDownloadButtonComponents = (latestAppVersion: string) => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Télécharger MemeDrop')
      .setStyle(ButtonStyle.Link)
      .setURL(getReleaseUrl(latestAppVersion)),
  ),
]

export const createHelpButtonComponents = (
  latestAppVersion: string,
  publicBaseUrl?: string,
) => {
  const buttons = [
    new ButtonBuilder()
      .setLabel('Télécharger MemeDrop')
      .setStyle(ButtonStyle.Link)
      .setURL(getReleaseUrl(latestAppVersion)),
  ]
  const guideUrl = getPublicGuideUrl(publicBaseUrl)

  if (guideUrl) {
    buttons.unshift(
      new ButtonBuilder()
        .setLabel('Guide MemeDrop')
        .setStyle(ButtonStyle.Link)
        .setURL(guideUrl),
    )
  }

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
}

export const getDropKindLabel = (drop: Drop) => {
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

export const addRecentDrop = (recentDrops: RecentDrop[], drop: Drop) => {
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

export const userHasAllowedRole = (
  interaction: ChatInputCommandInteraction,
  allowedRoleIds: string[],
) => {
  if (!allowedRoleIds.length) {
    return true
  }

  const roles = interaction.member?.roles as GuildMemberRoleManager | string[] | undefined

  if (Array.isArray(roles)) {
    return roles.some((roleId) => allowedRoleIds.includes(roleId))
  }

  return Boolean(roles?.cache.some((role) => allowedRoleIds.includes(role.id)))
}

export const getAvailableDropTargets = (
  getConnectedUsers: GetConnectedUsers,
  requesterId?: string,
) =>
  getConnectedUsers()
    .filter((user) => user.dropsEnabled && user.id !== requesterId)
    .sort((a, b) => a.name.localeCompare(b.name))

export const resolveConnectedUserName = async (
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

export const getTargetUser = async (
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

export const getSelfDropTarget = async (
  interaction: ChatInputCommandInteraction,
  getConnectedUsers: GetConnectedUsers,
): Promise<DropTarget | null> => {
  const self = getConnectedUsers().find(
    (user) => user.id === interaction.user.id && user.dropsEnabled,
  )

  if (!self) {
    return null
  }

  return {
    id: self.id,
    name: await resolveConnectedUserName(interaction, self),
  }
}

export const withTarget = (drop: Drop, targetUser: DropTarget | null): Drop => ({
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

export const editDropReplyAndRemember = async (
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

export const getCooldownRemainingSeconds = (
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
