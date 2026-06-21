import { onBeforeUnmount, onMounted } from 'vue'
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
