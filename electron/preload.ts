import { ipcRenderer, contextBridge } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { MemeDropPreloadApi, Unsubscribe } from '../shared/preloadApi'
import type {
  ConnectionStatus,
  ActiveDropSnapshot,
  ConnectedUser,
  Drop,
  AppPreferences,
  AppUpdateState,
  AppVersionInfo,
  ControlPanelSectionId,
  ControlPanelSectionState,
  OverlayDisplayInfo,
  OverlayDisplayPreferences,
  OverlayState,
  ServerConfig,
  ShortcutConfig,
  ShortcutStatus,
} from '../shared/types'

const onChannel = <T>(channel: string, handler: (payload: T) => void): Unsubscribe => {
  const listener = (_event: IpcRendererEvent, payload: T) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

const memedropApi = {
  onDrop: (handler: (drop: Drop) => void) => onChannel('drop-received', handler),
  onTestDrop: (handler: (drop: Drop) => void) => onChannel('test-drop-received', handler),
  onClearDrop: (handler: () => void) => onChannel('clear-drop', handler),
  onTestDropCleared: (handler: (dropId: string) => void) =>
    onChannel('test-drop-cleared', handler),
  onSkipCurrentDrop: (handler: (dropId: string) => void) =>
    onChannel('skip-current-drop', handler),
  onConnectionStatus: (handler: (status: ConnectionStatus) => void) =>
    onChannel('connection-status', handler),
  onConnectedUsers: (handler: (users: ConnectedUser[]) => void) =>
    onChannel('connected-users', handler),
  onShortcutStatus: (handler: (status: ShortcutStatus[]) => void) =>
    onChannel('shortcut-status', handler),
  onShortcutConfigs: (handler: (shortcuts: ShortcutConfig[]) => void) =>
    onChannel('shortcut-configs', handler),
  onShortcutCaptureCancelled: (handler: () => void) =>
    onChannel('shortcut-capture-cancelled', handler),
  onOverlayState: (handler: (state: OverlayState) => void) =>
    onChannel('overlay-state', handler),
  onOverlayDisplayPreferences: (handler: (preferences: OverlayDisplayPreferences) => void) =>
    onChannel('overlay-display-preferences', handler),
  onOverlayDisplays: (handler: (displays: OverlayDisplayInfo[]) => void) =>
    onChannel('overlay-displays', handler),
  onAppPreferences: (handler: (preferences: AppPreferences) => void) =>
    onChannel('app-preferences', handler),
  onAppVersionInfo: (handler: (info: AppVersionInfo) => void) =>
    onChannel('app-version-info', handler),
  onAppUpdateState: (handler: (state: AppUpdateState) => void) =>
    onChannel('app-update-state', handler),
  onServerConfig: (handler: (config: ServerConfig) => void) =>
    onChannel('server-config', handler),
  setDropsEnabled: (enabled: boolean) => ipcRenderer.invoke('set-drops-enabled', enabled),
  setHideOwnDrops: (enabled: boolean) => ipcRenderer.invoke('set-hide-own-drops', enabled),
  toggleDrops: () => ipcRenderer.invoke('toggle-drops'),
  toggleHideOwnDrops: () => ipcRenderer.invoke('toggle-hide-own-drops'),
  skipCurrentDrop: (dropId: string) => ipcRenderer.invoke('skip-current-drop', dropId),
  completeCurrentDrop: (dropId: string) => ipcRenderer.invoke('complete-current-drop', dropId),
  stopCurrentDropForEveryone: (dropId: string): Promise<boolean> =>
    ipcRenderer.invoke('stop-current-drop-for-everyone', dropId),
  getOverlayState: () => ipcRenderer.invoke('get-overlay-state'),
  getActiveDropSnapshot: (): Promise<ActiveDropSnapshot> =>
    ipcRenderer.invoke('get-active-drop-snapshot'),
  getOverlayDisplayPreferences: () => ipcRenderer.invoke('get-overlay-display-preferences'),
  getOverlayDisplays: () => ipcRenderer.invoke('get-overlay-displays'),
  setOverlayDisplayPreferences: (preferences: OverlayDisplayPreferences) =>
    ipcRenderer.invoke('set-overlay-display-preferences', preferences),
  getAppPreferences: () => ipcRenderer.invoke('get-app-preferences'),
  getAppVersionInfo: () => ipcRenderer.invoke('get-app-version-info'),
  getAppUpdateState: () => ipcRenderer.invoke('get-app-update-state'),
  checkForAppUpdate: () => ipcRenderer.invoke('check-for-app-update'),
  downloadAppUpdate: () => ipcRenderer.invoke('download-app-update'),
  installAppUpdate: () => ipcRenderer.invoke('install-app-update'),
  setAppPreferences: (preferences: AppPreferences) =>
    ipcRenderer.invoke('set-app-preferences', preferences),
  getControlPanelSectionState: (): Promise<ControlPanelSectionState> =>
    ipcRenderer.invoke('get-control-panel-section-state'),
  setControlPanelSectionOpen: (
    sectionId: ControlPanelSectionId,
    open: boolean,
  ): Promise<ControlPanelSectionState> =>
    ipcRenderer.invoke('set-control-panel-section-open', sectionId, open),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  uninstallApp: () => ipcRenderer.invoke('uninstall-app'),
  openReleasePage: () => ipcRenderer.invoke('open-release-page'),
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  getConnectedUsers: () => ipcRenderer.invoke('get-connected-users'),
  getShortcutStatus: () => ipcRenderer.invoke('get-shortcut-status'),
  getShortcutConfigs: () => ipcRenderer.invoke('get-shortcut-configs'),
  startShortcutCapture: (action: ShortcutConfig['action']) =>
    ipcRenderer.invoke('start-shortcut-capture', action),
  setShortcutCaptureMode: (enabled: boolean) =>
    ipcRenderer.invoke('set-shortcut-capture-mode', enabled),
  setShortcutConfigs: (shortcuts: ShortcutConfig[]) =>
    ipcRenderer.invoke('set-shortcut-configs', shortcuts),
  resetShortcutConfigs: () => ipcRenderer.invoke('reset-shortcut-configs'),
  getServerConfig: () => ipcRenderer.invoke('get-server-config'),
  saveServerConfig: (config: ServerConfig) => ipcRenderer.invoke('save-server-config', config),
  authenticateDiscord: () => ipcRenderer.invoke('authenticate-discord'),
  disconnectDiscord: () => ipcRenderer.invoke('disconnect-discord'),
  emitTestDrop: (drop: Drop) => ipcRenderer.invoke('emit-test-drop', drop),
  clearTestDrop: (dropId: string) => ipcRenderer.invoke('clear-test-drop', dropId),
} satisfies MemeDropPreloadApi

contextBridge.exposeInMainWorld('memedrop', memedropApi)
