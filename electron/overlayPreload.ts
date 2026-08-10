import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { MemeDropOverlayPreloadApi, Unsubscribe } from '../shared/preloadApi'
import type { Drop, OverlayDisplayPreferences, OverlayState } from '../shared/types'

const onChannel = <T>(channel: string, handler: (payload: T) => void): Unsubscribe => {
  const listener = (_event: IpcRendererEvent, payload: T) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

const overlayApi = {
  onDrop: (handler: (drop: Drop) => void) => onChannel('drop-received', handler),
  onClearDrop: (handler: () => void) => onChannel('clear-drop', handler),
  onTestDropCleared: (handler: () => void) => onChannel('test-drop-cleared', handler),
  onSkipCurrentDrop: (handler: () => void) => onChannel('skip-current-drop', handler),
  onOverlayState: (handler: (state: OverlayState) => void) =>
    onChannel('overlay-state', handler),
  onOverlayDisplayPreferences: (
    handler: (preferences: OverlayDisplayPreferences) => void,
  ) => onChannel('overlay-display-preferences', handler),
  completeCurrentDrop: (dropId: string) => ipcRenderer.invoke('complete-current-drop', dropId),
  getOverlayState: () => ipcRenderer.invoke('get-overlay-state'),
  getOverlayDisplayPreferences: () =>
    ipcRenderer.invoke('get-overlay-display-preferences'),
} satisfies MemeDropOverlayPreloadApi

contextBridge.exposeInMainWorld('memedropOverlay', overlayApi)
