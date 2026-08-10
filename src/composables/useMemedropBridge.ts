import { onBeforeUnmount, onMounted, type ComputedRef } from 'vue'
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
  ShortcutConfig,
  ShortcutStatus,
} from '../../shared/types'

type MemedropBridgeOptions = {
  isOverlayView: ComputedRef<boolean>
  applyOverlayState: (state: OverlayState) => void
  applyOverlayDisplayPreferences: (preferences: OverlayDisplayPreferences) => void
  setOverlayDisplays: (displays: OverlayDisplayInfo[]) => void
  setAppPreferences: (preferences: AppPreferences) => void
  setAppVersionInfo: (info: AppVersionInfo) => void
  setAppUpdateState: (state: AppUpdateState) => void
  setConnectionStatus: (status: ConnectionStatus | null) => void
  setConnectedUsers: (users: ConnectedUser[]) => void
  setShortcutConfigs: (shortcuts: ShortcutConfig[]) => void
  setShortcutStatus: (status: ShortcutStatus[]) => void
  setServerConfig: (config: ServerConfig) => void
  receiveDrop: (drop: Drop) => void
  clearServerDrop: () => void
  clearTestDrop: () => void
  completeLocalDrop: () => void
}

export const useMemedropBridge = ({
  isOverlayView,
  applyOverlayState,
  applyOverlayDisplayPreferences,
  setOverlayDisplays,
  setAppPreferences,
  setAppVersionInfo,
  setAppUpdateState,
  setConnectionStatus,
  setConnectedUsers,
  setShortcutConfigs,
  setShortcutStatus,
  setServerConfig,
  receiveDrop,
  clearServerDrop,
  clearTestDrop,
  completeLocalDrop,
}: MemedropBridgeOptions) => {
  const unsubscribers: Array<() => void> = []

  const remember = (unsubscribe: (() => void) | undefined) => {
    if (unsubscribe) {
      unsubscribers.push(unsubscribe)
    }
  }

  const requestInitialState = async () => {
    if (isOverlayView.value) {
      const overlayBridge = window.memedropOverlay
      if (!overlayBridge) {
        return
      }

      applyOverlayState(await overlayBridge.getOverlayState())
      applyOverlayDisplayPreferences(await overlayBridge.getOverlayDisplayPreferences())
      return
    }

    const memedrop = window.memedrop
    if (!memedrop) {
      return
    }

    applyOverlayState(await memedrop.getOverlayState())
    applyOverlayDisplayPreferences(await memedrop.getOverlayDisplayPreferences())
    setOverlayDisplays(await memedrop.getOverlayDisplays())
    setAppPreferences(await memedrop.getAppPreferences())
    setAppVersionInfo(await memedrop.getAppVersionInfo())
    setAppUpdateState(await memedrop.getAppUpdateState())
    setConnectionStatus(await memedrop.getConnectionStatus())
    setConnectedUsers(await memedrop.getConnectedUsers())
    setShortcutConfigs(await memedrop.getShortcutConfigs())
    setShortcutStatus(await memedrop.getShortcutStatus())
    setServerConfig(await memedrop.getServerConfig())
  }

  const subscribe = () => {
    if (isOverlayView.value) {
      const overlayBridge = window.memedropOverlay
      if (!overlayBridge) {
        return
      }

      remember(overlayBridge.onDrop(receiveDrop))
      remember(overlayBridge.onClearDrop(clearServerDrop))
      remember(overlayBridge.onTestDropCleared(clearTestDrop))
      remember(overlayBridge.onSkipCurrentDrop(completeLocalDrop))
      remember(overlayBridge.onOverlayState(applyOverlayState))
      remember(
        overlayBridge.onOverlayDisplayPreferences(applyOverlayDisplayPreferences),
      )
      return
    }

    const memedrop = window.memedrop
    if (!memedrop) {
      return
    }

    remember(memedrop.onDrop(receiveDrop))
    remember(memedrop.onClearDrop(clearServerDrop))
    remember(memedrop.onTestDropCleared(clearTestDrop))
    remember(memedrop.onSkipCurrentDrop(completeLocalDrop))
    remember(memedrop.onConnectionStatus(setConnectionStatus))
    remember(memedrop.onConnectedUsers(setConnectedUsers))
    remember(memedrop.onShortcutStatus(setShortcutStatus))
    remember(memedrop.onShortcutConfigs(setShortcutConfigs))
    remember(memedrop.onOverlayState(applyOverlayState))
    remember(memedrop.onOverlayDisplayPreferences(applyOverlayDisplayPreferences))
    remember(memedrop.onOverlayDisplays(setOverlayDisplays))
    remember(memedrop.onAppPreferences(setAppPreferences))
    remember(memedrop.onAppVersionInfo(setAppVersionInfo))
    remember(memedrop.onAppUpdateState(setAppUpdateState))
  }

  onMounted(async () => {
    await requestInitialState()
    subscribe()
  })

  onBeforeUnmount(() => {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    unsubscribers.length = 0
  })

  return {
    requestInitialState,
  }
}
