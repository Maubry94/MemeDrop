import type {
  AppPreferences,
  ActiveDropSnapshot,
  AppUpdateState,
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  ControlPanelSectionId,
  ControlPanelSectionState,
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
  onTestDrop: (handler: (drop: Drop) => void) => Unsubscribe
  onClearDrop: (handler: () => void) => Unsubscribe
  onTestDropCleared: (handler: (dropId: string) => void) => Unsubscribe
  onSkipCurrentDrop: (handler: (dropId: string) => void) => Unsubscribe
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
  onAppUpdateState: (handler: (state: AppUpdateState) => void) => Unsubscribe
  onServerConfig: (handler: (config: ServerConfig) => void) => Unsubscribe
  setDropsEnabled: (enabled: boolean) => Promise<OverlayState>
  setHideOwnDrops: (enabled: boolean) => Promise<OverlayState>
  toggleDrops: () => Promise<OverlayState>
  toggleHideOwnDrops: () => Promise<OverlayState>
  skipCurrentDrop: (dropId: string) => Promise<boolean>
  completeCurrentDrop: (dropId: string) => Promise<boolean>
  stopCurrentDropForEveryone: (dropId: string) => Promise<boolean>
  getOverlayState: () => Promise<OverlayState>
  getActiveDropSnapshot: () => Promise<ActiveDropSnapshot>
  getOverlayDisplayPreferences: () => Promise<OverlayDisplayPreferences>
  getOverlayDisplays: () => Promise<OverlayDisplayInfo[]>
  setOverlayDisplayPreferences: (
    preferences: OverlayDisplayPreferences,
  ) => Promise<OverlayDisplayPreferences>
  getAppPreferences: () => Promise<AppPreferences>
  getAppVersionInfo: () => Promise<AppVersionInfo>
  getAppUpdateState: () => Promise<AppUpdateState>
  checkForAppUpdate: () => Promise<AppUpdateState>
  downloadAppUpdate: () => Promise<AppUpdateState>
  installAppUpdate: () => Promise<AppUpdateState>
  setAppPreferences: (preferences: AppPreferences) => Promise<AppPreferences>
  getControlPanelSectionState: () => Promise<ControlPanelSectionState>
  setControlPanelSectionOpen: (
    sectionId: ControlPanelSectionId,
    open: boolean,
  ) => Promise<ControlPanelSectionState>
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
  emitTestDrop: (drop: Drop) => Promise<boolean>
  clearTestDrop: (dropId: string) => Promise<boolean>
}

export type MemeDropOverlayPreloadApi = Pick<
  MemeDropPreloadApi,
  | 'onDrop'
  | 'onTestDrop'
  | 'onClearDrop'
  | 'onTestDropCleared'
  | 'onSkipCurrentDrop'
  | 'onOverlayState'
  | 'onOverlayDisplayPreferences'
  | 'completeCurrentDrop'
  | 'clearTestDrop'
  | 'getActiveDropSnapshot'
  | 'getOverlayState'
  | 'getOverlayDisplayPreferences'
>
