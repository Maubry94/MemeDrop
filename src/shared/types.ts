export type Drop = {
  id: string
  url: string
  contentType: string | null
  fileName: string | null
  youtubeVideoId?: string | null
  caption: string | null
  authorId: string | null
  ownerId?: string | null
  isAnonymous?: boolean
  author: string | null
  authorAvatarUrl: string | null
  createdAt: string
}

export type ConnectionStatus = {
  level: 'info' | 'error'
  message: string
}

export type DiscordUser = {
  id: string
  username: string
  avatarUrl: string | null
}

export type ServerConfig = {
  serverUrl: string
  accessKey: string
  discordUserId: string
  discordUserName: string
  discordUserAvatarUrl: string | null
}

export type OverlayState = {
  dropsEnabled: boolean
  hideOwnDrops: boolean
}

export type ShortcutStatus = {
  accelerator: string
  label: string
  registered: boolean
}

export type AppPreferences = {
  minimizeToTray: boolean
  openAtLogin: boolean
}
