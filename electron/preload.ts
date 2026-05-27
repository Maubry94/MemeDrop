import { ipcRenderer, contextBridge } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  ConnectionStatus,
  Drop,
  AppPreferences,
  OverlayState,
  ServerConfig,
  ShortcutStatus,
} from '../src/shared/types'

type Unsubscribe = () => void

const onChannel = <T>(channel: string, handler: (payload: T) => void): Unsubscribe => {
  const listener = (_event: IpcRendererEvent, payload: T) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

contextBridge.exposeInMainWorld('memedrop', {
  onDrop: (handler: (drop: Drop) => void) => onChannel('drop-received', handler),
  onClearDrop: (handler: () => void) => onChannel('clear-drop', handler),
  onTestDropCleared: (handler: () => void) => onChannel('test-drop-cleared', handler),
  onSkipCurrentDrop: (handler: () => void) => onChannel('skip-current-drop', handler),
  onConnectionStatus: (handler: (status: ConnectionStatus) => void) =>
    onChannel('connection-status', handler),
  onShortcutStatus: (handler: (status: ShortcutStatus[]) => void) =>
    onChannel('shortcut-status', handler),
  onOverlayState: (handler: (state: OverlayState) => void) =>
    onChannel('overlay-state', handler),
  onAppPreferences: (handler: (preferences: AppPreferences) => void) =>
    onChannel('app-preferences', handler),
  setDropsEnabled: (enabled: boolean) => ipcRenderer.invoke('set-drops-enabled', enabled),
  setHideOwnDrops: (enabled: boolean) => ipcRenderer.invoke('set-hide-own-drops', enabled),
  toggleDrops: () => ipcRenderer.invoke('toggle-drops'),
  toggleHideOwnDrops: () => ipcRenderer.invoke('toggle-hide-own-drops'),
  skipCurrentDrop: () => ipcRenderer.invoke('skip-current-drop'),
  completeCurrentDrop: (dropId: string) => ipcRenderer.invoke('complete-current-drop', dropId),
  stopCurrentDropForEveryone: () => ipcRenderer.invoke('stop-current-drop-for-everyone'),
  getOverlayState: () => ipcRenderer.invoke('get-overlay-state'),
  getAppPreferences: () => ipcRenderer.invoke('get-app-preferences'),
  setAppPreferences: (preferences: AppPreferences) =>
    ipcRenderer.invoke('set-app-preferences', preferences),
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  getShortcutStatus: () => ipcRenderer.invoke('get-shortcut-status'),
  getServerConfig: () => ipcRenderer.invoke('get-server-config'),
  saveServerConfig: (config: ServerConfig) => ipcRenderer.invoke('save-server-config', config),
  authenticateDiscord: () => ipcRenderer.invoke('authenticate-discord'),
  disconnectDiscord: () => ipcRenderer.invoke('disconnect-discord'),
  emitTestDrop: (drop: Drop) => ipcRenderer.invoke('emit-test-drop', drop),
  clearTestDrop: () => ipcRenderer.invoke('clear-test-drop'),
})
