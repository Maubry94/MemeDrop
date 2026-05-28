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
  targetUserId?: string | null
  targetUserName?: string | null
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

export type ConnectedUser = {
  id: string
  name: string
  avatarUrl: string | null
  connections: number
  dropsEnabled: boolean
  appVersion: string | null
  appVersions: string[]
  latestAppVersion: string
  updateAvailable: boolean
}

export type AppVersionInfo = {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  releaseUrl: string
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

export type OverlayAnchor = 'full' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type OverlayPosition = OverlayAnchor | 'custom'

export type OverlayDisplayPreferences = {
  displayId: string
  position: OverlayPosition
  volume: number
  size: number
  customX: number
  customY: number
  customAnchor: OverlayAnchor
}

export type OverlayDisplayInfo = {
  id: string
  label: string
  isPrimary: boolean
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
}

export type ShortcutActionId = 'toggleDrops' | 'skipDrop' | 'toggleOwnDrops' | 'stopGlobalDrop'

export type ShortcutConfig = {
  action: ShortcutActionId
  accelerator: string
}

export type ShortcutStatus = ShortcutConfig & {
  label: string
  registered: boolean
}

export type AppPreferences = {
  minimizeToTray: boolean
  openAtLogin: boolean
}
