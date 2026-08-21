import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { DEFAULT_CONTROL_PANEL_SECTION_STATE } from '../../shared/types'
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
} from '../../shared/types'

export type MemeDropIpcHandlers = {
  isControlSender: (sender: WebContents) => boolean
  isOverlaySender: (sender: WebContents) => boolean
  setDropsEnabled: (enabled: boolean) => OverlayState
  setHideOwnDrops: (enabled: boolean) => OverlayState
  getOverlayState: () => OverlayState
  getActiveDropSnapshot: (view: 'control' | 'overlay') => ActiveDropSnapshot
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
  installAppUpdate: () => Promise<AppUpdateState>
  openReleasePage: () => void
  setAppPreferences: (preferences: AppPreferences) => AppPreferences
  getControlPanelSectionState: () => ControlPanelSectionState
  setControlPanelSectionOpen: (
    sectionId: ControlPanelSectionId,
    open: boolean,
  ) => ControlPanelSectionState
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
  skipCurrentDrop: (dropId: string) => boolean
  completeCurrentDrop: (dropId: string) => boolean
  stopCurrentDropForEveryone: (dropId: string) => boolean
  emitTestDrop: (drop: Drop) => boolean
  clearTestDrop: (dropId: string) => boolean
}

export const registerMemeDropIpcHandlers = (handlers: MemeDropIpcHandlers) => {
  const handle = <TArgs extends unknown[]>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: TArgs) => unknown,
    allowOverlay = false,
  ) => {
    ipcMain.handle(channel, (event, ...args) => {
      const isAllowed =
        event.senderFrame === event.sender.mainFrame &&
        (
          handlers.isControlSender(event.sender) ||
          (allowOverlay && handlers.isOverlaySender(event.sender))
        )

      if (!isAllowed) {
        throw new Error(`IPC MemeDrop refusé pour ce renderer : ${channel}.`)
      }

      return listener(event, ...(args as TArgs))
    })
  }

  const requireDropId = (value: unknown) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
      throw new Error('Identifiant de drop invalide.')
    }
    return value
  }

  const requireControlPanelSectionId = (value: unknown): ControlPanelSectionId => {
    if (
      typeof value !== 'string' ||
      !Object.prototype.hasOwnProperty.call(DEFAULT_CONTROL_PANEL_SECTION_STATE, value)
    ) {
      throw new Error('Identifiant de section du panneau de contrôle invalide.')
    }

    return value as ControlPanelSectionId
  }

  const requireBoolean = (value: unknown) => {
    if (typeof value !== 'boolean') {
      throw new Error('État de section du panneau de contrôle invalide.')
    }

    return value
  }

  handle('set-drops-enabled', (_event, enabled: boolean) =>
    handlers.setDropsEnabled(Boolean(enabled)),
  )

  handle('set-hide-own-drops', (_event, enabled: boolean) =>
    handlers.setHideOwnDrops(Boolean(enabled)),
  )

  handle('get-overlay-state', () => handlers.getOverlayState(), true)
  handle(
    'get-active-drop-snapshot',
    (event) =>
      handlers.getActiveDropSnapshot(
        handlers.isOverlaySender(event.sender) ? 'overlay' : 'control',
      ),
    true,
  )
  handle(
    'get-overlay-display-preferences',
    () => handlers.getOverlayDisplayPreferences(),
    true,
  )
  handle('get-overlay-displays', () => handlers.getOverlayDisplays())
  handle(
    'set-overlay-display-preferences',
    (_event, preferences: OverlayDisplayPreferences) =>
      handlers.setOverlayDisplayPreferences(preferences),
  )
  handle('get-app-preferences', () => handlers.getAppPreferences())
  handle('get-app-version-info', () => handlers.getAppVersionInfo())
  handle('get-app-update-state', () => handlers.getAppUpdateState())
  handle('check-for-app-update', () => handlers.checkForAppUpdate())
  handle('download-app-update', () => handlers.downloadAppUpdate())
  handle('install-app-update', () => handlers.installAppUpdate())
  handle('open-release-page', () => handlers.openReleasePage())
  handle('set-app-preferences', (_event, preferences: AppPreferences) =>
    handlers.setAppPreferences(preferences),
  )
  handle('get-control-panel-section-state', () =>
    handlers.getControlPanelSectionState(),
  )
  handle(
    'set-control-panel-section-open',
    (_event, sectionId: unknown, open: unknown) =>
      handlers.setControlPanelSectionOpen(
        requireControlPanelSectionId(sectionId),
        requireBoolean(open),
      ),
  )
  handle('quit-app', () => handlers.quitApp())
  handle('uninstall-app', () => handlers.uninstallApp())
  handle('get-connection-status', () => handlers.getConnectionStatus())
  handle('get-shortcut-status', () => handlers.getShortcutStatus())
  handle('get-shortcut-configs', () => handlers.getShortcutConfigs())
  handle('start-shortcut-capture', (_event, action: ShortcutActionId) =>
    handlers.startShortcutCapture(action),
  )
  handle('set-shortcut-capture-mode', (_event, enabled: boolean) => {
    handlers.setShortcutCaptureMode(Boolean(enabled))
  })
  handle('set-shortcut-configs', (_event, shortcuts: ShortcutConfig[]) =>
    handlers.setShortcutConfigs(shortcuts),
  )
  handle('reset-shortcut-configs', () => handlers.resetShortcutConfigs())
  handle('get-connected-users', () => handlers.getConnectedUsers())
  handle('get-server-config', () => handlers.getServerConfig())
  handle('save-server-config', (_event, config: ServerConfig) =>
    handlers.saveServerConfig(config),
  )
  handle('authenticate-discord', () => handlers.authenticateDiscord())
  handle('disconnect-discord', () => handlers.disconnectDiscord())
  handle('toggle-drops', () => handlers.toggleDrops())
  handle('toggle-hide-own-drops', () => handlers.toggleHideOwnDrops())
  handle('skip-current-drop', (_event, dropId: string) =>
    handlers.skipCurrentDrop(requireDropId(dropId)),
  )
  handle(
    'complete-current-drop',
    (_event, dropId: string) => handlers.completeCurrentDrop(requireDropId(dropId)),
    true,
  )
  handle('stop-current-drop-for-everyone', (_event, dropId: string) =>
    handlers.stopCurrentDropForEveryone(requireDropId(dropId)),
  )
  handle('emit-test-drop', (_event, drop: Drop) => handlers.emitTestDrop(drop))
  handle(
    'clear-test-drop',
    (_event, dropId: string) => handlers.clearTestDrop(requireDropId(dropId)),
    true,
  )
}
