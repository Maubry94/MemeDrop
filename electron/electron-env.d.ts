/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  memedrop: {
    onDrop: (handler: (drop: import('../src/shared/types').Drop) => void) => () => void
    onSkipCurrentDrop: (handler: () => void) => () => void
    onConnectionStatus: (
      handler: (status: import('../src/shared/types').ConnectionStatus) => void,
    ) => () => void
    onShortcutStatus: (
      handler: (status: import('../src/shared/types').ShortcutStatus[]) => void,
    ) => () => void
    onOverlayState: (
      handler: (state: import('../src/shared/types').OverlayState) => void,
    ) => () => void
    setDropsEnabled: (
      enabled: boolean,
    ) => Promise<import('../src/shared/types').OverlayState>
    setHideOwnDrops: (
      enabled: boolean,
    ) => Promise<import('../src/shared/types').OverlayState>
    toggleDrops: () => Promise<import('../src/shared/types').OverlayState>
    toggleHideOwnDrops: () => Promise<import('../src/shared/types').OverlayState>
    skipCurrentDrop: () => Promise<void>
    getOverlayState: () => Promise<import('../src/shared/types').OverlayState>
    getConnectionStatus: () => Promise<import('../src/shared/types').ConnectionStatus | null>
    getShortcutStatus: () => Promise<import('../src/shared/types').ShortcutStatus[]>
    getServerConfig: () => Promise<import('../src/shared/types').ServerConfig>
    saveServerConfig: (
      config: import('../src/shared/types').ServerConfig,
    ) => Promise<import('../src/shared/types').ServerConfig>
    authenticateDiscord: () => Promise<import('../src/shared/types').ServerConfig>
    disconnectDiscord: () => Promise<import('../src/shared/types').ServerConfig>
    emitTestDrop: (drop: import('../src/shared/types').Drop) => Promise<void>
  }
}
