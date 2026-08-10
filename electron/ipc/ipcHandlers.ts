import { ipcMain } from 'electron'
import type {
  AppPreferences,
  AppUpdateState,
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
} from '../../shared/types'

export type MemeDropIpcHandlers = {
  setDropsEnabled: (enabled: boolean) => OverlayState
  setHideOwnDrops: (enabled: boolean) => OverlayState
  getOverlayState: () => OverlayState
  getOverlayDisplayPreferences: () => OverlayDisplayPreferences
  getOverlayDisplays: () => OverlayDisplayInfo[]
  setOverlayDisplayPreferences: (
    preferences: OverlayDisplayPreferences,
  ) => OverlayDisplayPreferences
  getAppPreferences: () => AppPreferences
  getAppVersionInfo: () => AppVersionInfo
  getAppUpdateState: () => AppUpdateState
  checkForAppUpdate: () => Promise<AppUpdateState>
  downloadAppUpdate: () => Promise<AppUpdateState>
  installAppUpdate: () => AppUpdateState
  getTikTokPreloadUrl: () => string
  openReleasePage: () => void
  setAppPreferences: (preferences: AppPreferences) => AppPreferences
  quitApp: () => void
  uninstallApp: () => void
  getConnectionStatus: () => ConnectionStatus | null
  getShortcutStatus: () => ShortcutStatus[]
  getShortcutConfigs: () => ShortcutConfig[]
  startShortcutCapture: (action: ShortcutActionId) => ShortcutConfig[]
  setShortcutCaptureMode: (enabled: boolean) => void
  setShortcutConfigs: (shortcuts: ShortcutConfig[]) => ShortcutConfig[]
  resetShortcutConfigs: () => ShortcutConfig[]
  getConnectedUsers: () => ConnectedUser[]
  getServerConfig: () => ServerConfig
  saveServerConfig: (config: ServerConfig) => ServerConfig
  authenticateDiscord: () => Promise<ServerConfig>
  disconnectDiscord: () => ServerConfig
  toggleDrops: () => OverlayState
  toggleHideOwnDrops: () => OverlayState
  skipCurrentDrop: () => void
  completeCurrentDrop: (dropId: string) => void
  stopCurrentDropForEveryone: () => void
  emitTestDrop: (drop: Drop) => void
  clearTestDrop: () => void
}

export const registerMemeDropIpcHandlers = (handlers: MemeDropIpcHandlers) => {
  ipcMain.handle('set-drops-enabled', (_event, enabled: boolean) =>
    handlers.setDropsEnabled(Boolean(enabled)),
  )

  ipcMain.handle('set-hide-own-drops', (_event, enabled: boolean) =>
    handlers.setHideOwnDrops(Boolean(enabled)),
  )

  ipcMain.handle('get-overlay-state', () => handlers.getOverlayState())
  ipcMain.handle('get-overlay-display-preferences', () =>
    handlers.getOverlayDisplayPreferences(),
  )
  ipcMain.handle('get-overlay-displays', () => handlers.getOverlayDisplays())
  ipcMain.handle(
    'set-overlay-display-preferences',
    (_event, preferences: OverlayDisplayPreferences) =>
      handlers.setOverlayDisplayPreferences(preferences),
  )
  ipcMain.handle('get-app-preferences', () => handlers.getAppPreferences())
  ipcMain.handle('get-app-version-info', () => handlers.getAppVersionInfo())
  ipcMain.handle('get-app-update-state', () => handlers.getAppUpdateState())
  ipcMain.handle('check-for-app-update', () => handlers.checkForAppUpdate())
  ipcMain.handle('download-app-update', () => handlers.downloadAppUpdate())
  ipcMain.handle('install-app-update', () => handlers.installAppUpdate())
  ipcMain.handle('get-tiktok-preload-url', () => handlers.getTikTokPreloadUrl())
  ipcMain.handle('open-release-page', () => handlers.openReleasePage())
  ipcMain.handle('set-app-preferences', (_event, preferences: AppPreferences) =>
    handlers.setAppPreferences(preferences),
  )
  ipcMain.handle('quit-app', () => handlers.quitApp())
  ipcMain.handle('uninstall-app', () => handlers.uninstallApp())
  ipcMain.handle('get-connection-status', () => handlers.getConnectionStatus())
  ipcMain.handle('get-shortcut-status', () => handlers.getShortcutStatus())
  ipcMain.handle('get-shortcut-configs', () => handlers.getShortcutConfigs())
  ipcMain.handle('start-shortcut-capture', (_event, action: ShortcutActionId) =>
    handlers.startShortcutCapture(action),
  )
  ipcMain.handle('set-shortcut-capture-mode', (_event, enabled: boolean) => {
    handlers.setShortcutCaptureMode(Boolean(enabled))
  })
  ipcMain.handle('set-shortcut-configs', (_event, shortcuts: ShortcutConfig[]) =>
    handlers.setShortcutConfigs(shortcuts),
  )
  ipcMain.handle('reset-shortcut-configs', () => handlers.resetShortcutConfigs())
  ipcMain.handle('get-connected-users', () => handlers.getConnectedUsers())
  ipcMain.handle('get-server-config', () => handlers.getServerConfig())
  ipcMain.handle('save-server-config', (_event, config: ServerConfig) =>
    handlers.saveServerConfig(config),
  )
  ipcMain.handle('authenticate-discord', () => handlers.authenticateDiscord())
  ipcMain.handle('disconnect-discord', () => handlers.disconnectDiscord())
  ipcMain.handle('toggle-drops', () => handlers.toggleDrops())
  ipcMain.handle('toggle-hide-own-drops', () => handlers.toggleHideOwnDrops())
  ipcMain.handle('skip-current-drop', () => handlers.skipCurrentDrop())
  ipcMain.handle('complete-current-drop', (_event, dropId: string) => {
    handlers.completeCurrentDrop(dropId)
  })
  ipcMain.handle('stop-current-drop-for-everyone', () =>
    handlers.stopCurrentDropForEveryone(),
  )
  ipcMain.handle('emit-test-drop', (_event, drop: Drop) => handlers.emitTestDrop(drop))
  ipcMain.handle('clear-test-drop', () => handlers.clearTestDrop())
}
