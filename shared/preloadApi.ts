import type {
  AppPreferences,
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  Drop,
  OverlayDisplayInfo,
  OverlayDisplayPreferences,
  OverlayState,
  ServerConfig,
  ShortcutActionId,
  ShortcutConfig,
  ShortcutStatus,
} from './types.js'

export type Unsubscribe = () => void

export type MemeDropPreloadApi = {
  onDrop: (handler: (drop: Drop) => void) => Unsubscribe
  onClearDrop: (handler: () => void) => Unsubscribe
  onTestDropCleared: (handler: () => void) => Unsubscribe
  onSkipCurrentDrop: (handler: () => void) => Unsubscribe
  onConnectionStatus: (handler: (status: ConnectionStatus) => void) => Unsubscribe
  onConnectedUsers: (handler: (users: ConnectedUser[]) => void) => Unsubscribe
  onShortcutStatus: (handler: (status: ShortcutStatus[]) => void) => Unsubscribe
  onShortcutConfigs: (handler: (shortcuts: ShortcutConfig[]) => void) => Unsubscribe
  onShortcutCaptureCancelled: (handler: () => void) => Unsubscribe
  onOverlayState: (handler: (state: OverlayState) => void) => Unsubscribe
  onOverlayDisplayPreferences: (
    handler: (preferences: OverlayDisplayPreferences) => void,
  ) => Unsubscribe
  onOverlayDisplays: (handler: (displays: OverlayDisplayInfo[]) => void) => Unsubscribe
  onAppPreferences: (handler: (preferences: AppPreferences) => void) => Unsubscribe
  onAppVersionInfo: (handler: (info: AppVersionInfo) => void) => Unsubscribe
  setDropsEnabled: (enabled: boolean) => Promise<OverlayState>
  setHideOwnDrops: (enabled: boolean) => Promise<OverlayState>
  toggleDrops: () => Promise<OverlayState>
  toggleHideOwnDrops: () => Promise<OverlayState>
  skipCurrentDrop: () => Promise<void>
  completeCurrentDrop: (dropId: string) => Promise<void>
  stopCurrentDropForEveryone: () => Promise<void>
  getOverlayState: () => Promise<OverlayState>
  getOverlayDisplayPreferences: () => Promise<OverlayDisplayPreferences>
  getOverlayDisplays: () => Promise<OverlayDisplayInfo[]>
  setOverlayDisplayPreferences: (
    preferences: OverlayDisplayPreferences,
  ) => Promise<OverlayDisplayPreferences>
  getAppPreferences: () => Promise<AppPreferences>
  getAppVersionInfo: () => Promise<AppVersionInfo>
  getTikTokPreloadUrl: () => Promise<string>
  setAppPreferences: (preferences: AppPreferences) => Promise<AppPreferences>
  quitApp: () => Promise<void>
  uninstallApp: () => Promise<void>
  openReleasePage: () => Promise<void>
  getConnectionStatus: () => Promise<ConnectionStatus | null>
  getConnectedUsers: () => Promise<ConnectedUser[]>
  getShortcutStatus: () => Promise<ShortcutStatus[]>
  getShortcutConfigs: () => Promise<ShortcutConfig[]>
  startShortcutCapture: (action: ShortcutActionId) => Promise<ShortcutConfig[]>
  setShortcutCaptureMode: (enabled: boolean) => Promise<void>
  setShortcutConfigs: (shortcuts: ShortcutConfig[]) => Promise<ShortcutConfig[]>
  resetShortcutConfigs: () => Promise<ShortcutConfig[]>
  getServerConfig: () => Promise<ServerConfig>
  saveServerConfig: (config: ServerConfig) => Promise<ServerConfig>
  authenticateDiscord: () => Promise<ServerConfig>
  disconnectDiscord: () => Promise<ServerConfig>
  emitTestDrop: (drop: Drop) => Promise<void>
  clearTestDrop: () => Promise<void>
}
