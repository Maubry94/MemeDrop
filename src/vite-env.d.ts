/// <reference types="vite/client" />

interface Window {
  memedrop: {
    onDrop: (handler: (drop: import('../shared/types').Drop) => void) => () => void
    onClearDrop: (handler: () => void) => () => void
    onTestDropCleared: (handler: () => void) => () => void
    onSkipCurrentDrop: (handler: () => void) => () => void
    onConnectionStatus: (
      handler: (status: import('../shared/types').ConnectionStatus) => void,
    ) => () => void
    onConnectedUsers: (
      handler: (users: import('../shared/types').ConnectedUser[]) => void,
    ) => () => void
    onShortcutStatus: (
      handler: (status: import('../shared/types').ShortcutStatus[]) => void,
    ) => () => void
    onShortcutConfigs: (
      handler: (shortcuts: import('../shared/types').ShortcutConfig[]) => void,
    ) => () => void
    onShortcutCaptureCancelled: (handler: () => void) => () => void
    onOverlayState: (
      handler: (state: import('../shared/types').OverlayState) => void,
    ) => () => void
    onOverlayDisplayPreferences: (
      handler: (preferences: import('../shared/types').OverlayDisplayPreferences) => void,
    ) => () => void
    onOverlayDisplays: (
      handler: (displays: import('../shared/types').OverlayDisplayInfo[]) => void,
    ) => () => void
    onAppPreferences: (
      handler: (preferences: import('../shared/types').AppPreferences) => void,
    ) => () => void
    onAppVersionInfo: (
      handler: (info: import('../shared/types').AppVersionInfo) => void,
    ) => () => void
    setDropsEnabled: (
      enabled: boolean,
    ) => Promise<import('../shared/types').OverlayState>
    setHideOwnDrops: (
      enabled: boolean,
    ) => Promise<import('../shared/types').OverlayState>
    toggleDrops: () => Promise<import('../shared/types').OverlayState>
    toggleHideOwnDrops: () => Promise<import('../shared/types').OverlayState>
    skipCurrentDrop: () => Promise<void>
    completeCurrentDrop: (dropId: string) => Promise<void>
    stopCurrentDropForEveryone: () => Promise<void>
    getOverlayState: () => Promise<import('../shared/types').OverlayState>
    getOverlayDisplayPreferences: () => Promise<import('../shared/types').OverlayDisplayPreferences>
    getOverlayDisplays: () => Promise<import('../shared/types').OverlayDisplayInfo[]>
    setOverlayDisplayPreferences: (
      preferences: import('../shared/types').OverlayDisplayPreferences,
    ) => Promise<import('../shared/types').OverlayDisplayPreferences>
    getAppPreferences: () => Promise<import('../shared/types').AppPreferences>
    getAppVersionInfo: () => Promise<import('../shared/types').AppVersionInfo>
    getTikTokPreloadUrl: () => Promise<string>
    setAppPreferences: (
      preferences: import('../shared/types').AppPreferences,
    ) => Promise<import('../shared/types').AppPreferences>
    quitApp: () => Promise<void>
    uninstallApp: () => Promise<void>
    openReleasePage: () => Promise<void>
    getConnectionStatus: () => Promise<import('../shared/types').ConnectionStatus | null>
    getConnectedUsers: () => Promise<import('../shared/types').ConnectedUser[]>
    getShortcutStatus: () => Promise<import('../shared/types').ShortcutStatus[]>
    getShortcutConfigs: () => Promise<import('../shared/types').ShortcutConfig[]>
    startShortcutCapture: (
      action: import('../shared/types').ShortcutActionId,
    ) => Promise<import('../shared/types').ShortcutConfig[]>
    setShortcutCaptureMode: (enabled: boolean) => Promise<void>
    setShortcutConfigs: (
      shortcuts: import('../shared/types').ShortcutConfig[],
    ) => Promise<import('../shared/types').ShortcutConfig[]>
    resetShortcutConfigs: () => Promise<import('../shared/types').ShortcutConfig[]>
    getServerConfig: () => Promise<import('../shared/types').ServerConfig>
    saveServerConfig: (
      config: import('../shared/types').ServerConfig,
    ) => Promise<import('../shared/types').ServerConfig>
    authenticateDiscord: () => Promise<import('../shared/types').ServerConfig>
    disconnectDiscord: () => Promise<import('../shared/types').ServerConfig>
    emitTestDrop: (drop: import('../shared/types').Drop) => Promise<void>
    clearTestDrop: () => Promise<void>
  }
}
