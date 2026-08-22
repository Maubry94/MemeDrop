import type { Drop } from '@memedrop/protocol'

export type {
  ConnectedUser,
  DiscordUser,
  Drop,
  MemeDropClientMessage,
  MemeDropServerMessage,
} from '@memedrop/protocol'

export type ConnectionState =
  | 'configuration-required'
  | 'authentication-required'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'refused'
  | 'error'

export type ConnectionStatusReason =
  | 'server-not-configured'
  | 'discord-required'
  | 'session-expired'
  | 'access-denied'
  | 'invalid-server-url'
  | 'invalid-configuration'
  | 'connection-inactive'
  | 'transport-error'
  | 'server-policy'
  | 'computer-resumed'

export type ConnectionStatus = {
  state: ConnectionState
  reason?: ConnectionStatusReason
  level: 'info' | 'error'
  message: string
}

export type AppVersionInfo = {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  releaseUrl: string
}

export type AppUpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'verifying'
  | 'downloaded'
  | 'error'

export type AppUpdateState = {
  status: AppUpdateStatus
  currentVersion: string
  availableVersion: string | null
  downloadProgress: number | null
  errorMessage: string | null
  canCheck: boolean
  canDownload: boolean
  canInstall: boolean
}

export type ServerConfig = {
  serverUrl: string
  accessKey: string
  discordUserId: string
  discordUserName: string
  discordUserAvatarUrl: string | null
}

export type ActiveDropSnapshot = {
  serverDrop: Drop | null
  serverDropPresented: boolean
  testDrop: Drop | null
}

// Main-process only. Never expose this shape through the preload bridge.
export type ServerConnectionConfig = ServerConfig & {
  authToken: string
  authTokenExpiresAt: string | null
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

export type ControlPanelSectionId =
  | 'dropReception'
  | 'overlayAppearance'
  | 'accountAndServer'

export type ControlPanelSectionState = Record<ControlPanelSectionId, boolean>

export const DEFAULT_CONTROL_PANEL_SECTION_STATE: ControlPanelSectionState = {
  dropReception: true,
  overlayAppearance: true,
  accountAndServer: false,
}
