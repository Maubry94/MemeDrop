/// <reference types="vite/client" />

interface Window {
  memedrop: {
    onDrop: (handler: (drop: import('./shared/types').Drop) => void) => () => void
    onClearDrop: (handler: () => void) => () => void
    onSkipCurrentDrop: (handler: () => void) => () => void
    onConnectionStatus: (
      handler: (status: import('./shared/types').ConnectionStatus) => void,
    ) => () => void
    onShortcutStatus: (
      handler: (status: import('./shared/types').ShortcutStatus[]) => void,
    ) => () => void
    onOverlayState: (
      handler: (state: import('./shared/types').OverlayState) => void,
    ) => () => void
    setDropsEnabled: (
      enabled: boolean,
    ) => Promise<import('./shared/types').OverlayState>
    setHideOwnDrops: (
      enabled: boolean,
    ) => Promise<import('./shared/types').OverlayState>
    toggleDrops: () => Promise<import('./shared/types').OverlayState>
    toggleHideOwnDrops: () => Promise<import('./shared/types').OverlayState>
    skipCurrentDrop: () => Promise<void>
    completeCurrentDrop: (dropId: string) => Promise<void>
    stopCurrentDropForEveryone: () => Promise<void>
    getOverlayState: () => Promise<import('./shared/types').OverlayState>
    getConnectionStatus: () => Promise<import('./shared/types').ConnectionStatus | null>
    getShortcutStatus: () => Promise<import('./shared/types').ShortcutStatus[]>
    getServerConfig: () => Promise<import('./shared/types').ServerConfig>
    saveServerConfig: (
      config: import('./shared/types').ServerConfig,
    ) => Promise<import('./shared/types').ServerConfig>
    authenticateDiscord: () => Promise<import('./shared/types').ServerConfig>
    disconnectDiscord: () => Promise<import('./shared/types').ServerConfig>
    emitTestDrop: (drop: import('./shared/types').Drop) => Promise<void>
  }
}
