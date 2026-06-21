import {
  app,
  Menu,
  powerMonitor,
  screen,
  shell,
} from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { createAppActions } from './core/appActions'
import { createAppUpdater } from './core/appUpdater'
import type { ControlWindowBounds } from './core/appConfig'
import { createConfigStore } from './core/configStore'
import { createDesktopClient } from './client/desktopClient'
import {
  getControlWindowBounds as getSavedControlWindowBounds,
  getOverlayDisplays as getAvailableOverlayDisplays,
  getOverlayTargetDisplay as getTargetOverlayDisplay,
} from './desktop/displays'
import { createDiscordAuth } from './client/discordAuth'
import { registerMemeDropIpcHandlers } from './ipc/ipcHandlers'
import { createRendererServer } from './desktop/rendererServer'
import { createShortcutManager } from './desktop/shortcuts'
import { createMemeDropTray } from './desktop/tray'
import { createMemeDropWindows } from './desktop/windows'
import type {
  ConnectionStatus,
  AppPreferences,
  OverlayDisplayPreferences,
  OverlayState,
  ServerConfig,
} from '../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ID = 'com.memedrop.app'
const START_MINIMIZED_ARG = '--memedrop-start-minimized'

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const hasInstanceLock = VITE_DEV_SERVER_URL ? true : app.requestSingleInstanceLock()

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST
const windowIcon = path.join(process.env.VITE_PUBLIC, 'memeDrop.png')
const getAppTitle = () => `MemeDrop v${app.getVersion()}`
const getTikTokPreloadUrl = () => pathToFileURL(path.join(__dirname, 'tiktokPreload.mjs')).toString()
const rendererServer = createRendererServer({
  rendererDist: RENDERER_DIST,
  devServerUrl: VITE_DEV_SERVER_URL,
})
let configStore: ReturnType<typeof createConfigStore> | null = null
const getConfigStore = () => {
  configStore ??= createConfigStore(app.getPath('userData'))
  return configStore
}

let dropsEnabled = true
let hideOwnDrops = false
let appPreferences: AppPreferences = {
  minimizeToTray: false,
  openAtLogin: false,
}
let connectionStatus: ConnectionStatus | null = null
let isQuitting = false
let shouldStartControlHidden = false

const loadAppEnv = () => {
  const candidates = [
    path.join(process.env.APP_ROOT, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(path.dirname(process.execPath), '.env'),
    path.join(app.getPath('userData'), '.env'),
  ]

  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      loadEnv({ path: envPath, override: true })
    }
  }
}

const getServerConfig = (): ServerConfig => getConfigStore().getServerConfig()

const saveServerConfig = (config: ServerConfig): ServerConfig => {
  return getConfigStore().saveServerConfig(config)
}

const saveOverlayPreferences = () => {
  getConfigStore().saveHideOwnDrops(hideOwnDrops)
}

const loadOverlayPreferences = () => {
  hideOwnDrops = getConfigStore().getHideOwnDrops()
}

const getOverlayDisplayPreferences = (): OverlayDisplayPreferences =>
  getConfigStore().getOverlayDisplayPreferences()

const saveOverlayDisplayPreferences = (
  preferences: OverlayDisplayPreferences,
): OverlayDisplayPreferences => getConfigStore().saveOverlayDisplayPreferences(preferences)

const getOverlayDisplays = () => getAvailableOverlayDisplays(screen)

const getOverlayTargetDisplay = () => {
  return getTargetOverlayDisplay(screen, getOverlayDisplayPreferences())
}

const saveAppPreferences = () => {
  getConfigStore().saveAppPreferences(appPreferences)
}

const applyOpenAtLogin = () => {
  app.setLoginItemSettings({
    openAtLogin: appPreferences.openAtLogin,
    args:
      appPreferences.openAtLogin && appPreferences.minimizeToTray ? [START_MINIMIZED_ARG] : [],
  })
}

const loadAppPreferences = () => {
  appPreferences = getConfigStore().getAppPreferences()
  shouldStartControlHidden =
    appPreferences.minimizeToTray &&
    (process.argv.includes(START_MINIMIZED_ARG) || app.getLoginItemSettings().wasOpenedAtLogin)

  applyOpenAtLogin()
}

const getControlWindowBounds = (): ControlWindowBounds => {
  return getSavedControlWindowBounds(screen, getConfigStore().getControlWindowBounds())
}

const saveControlWindowBounds = (bounds: ControlWindowBounds) => {
  getConfigStore().saveControlWindowBounds(bounds)
}

const getOverlayState = (): OverlayState => ({
  dropsEnabled,
  hideOwnDrops,
})

const getAppPreferences = (): AppPreferences => ({ ...appPreferences })

const sendToWindows = (channel: string, payload: unknown) => {
  windows.sendToWindows(channel, payload)
}

const syncOverlayState = () => {
  sendToWindows('overlay-state', getOverlayState())
}

const syncOverlayDisplayPreferences = () => {
  sendToWindows('overlay-display-preferences', getOverlayDisplayPreferences())
}

const syncOverlayDisplays = () => {
  sendToWindows('overlay-displays', getOverlayDisplays())
}

const syncConnectionStatus = () => {
  if (!connectionStatus) {
    return
  }
  sendToWindows('connection-status', connectionStatus)
}

const syncShortcutStatus = () => {
  sendToWindows('shortcut-status', shortcutManager.getShortcutStatus())
}

const syncConnectedUsers = () => {
  sendToWindows('connected-users', desktopClient.getConnectedUsers())
}

const setConnectionStatus = (status: ConnectionStatus) => {
  connectionStatus = status
  sendToWindows('connection-status', status)
}

const desktopClient = createDesktopClient({
  getServerConfig,
  getAppVersion: () => app.getVersion(),
  getDropsEnabled: () => dropsEnabled,
  getHideOwnDrops: () => hideOwnDrops,
  onConnectedUsers: (users) => {
    sendToWindows('connected-users', users)
  },
  onAppVersionInfo: (info) => {
    sendToWindows('app-version-info', info)
  },
  onDrop: (drop) => {
    windows.keepOverlayAboveFullscreen()
    sendToWindows('drop-received', drop)
  },
  onControlOnlyDrop: (drop) => {
    windows.sendToControl('drop-received', drop)
  },
  onClearDrop: () => {
    sendToWindows('clear-drop', null)
  },
  onStatus: setConnectionStatus,
})

const appUpdater = createAppUpdater({
  getServerConfig,
  getCurrentVersion: () => app.getVersion(),
  onStateChanged: (state) => {
    sendToWindows('app-update-state', state)
  },
})

const discordAuth = createDiscordAuth({
  getServerConfig,
  saveServerConfig,
  openExternal: (url) => shell.openExternal(url),
  onConfigChanged: desktopClient.startOrRestart,
})

const setDropsEnabled = (enabled: boolean) => {
  dropsEnabled = enabled
  desktopClient.updateDropsEnabled(dropsEnabled)
  tray.updateMenu()
  syncOverlayState()
}

const setHideOwnDrops = (enabled: boolean) => {
  hideOwnDrops = enabled
  saveOverlayPreferences()
  tray.updateMenu()
  syncOverlayState()
}

const syncAppPreferences = () => {
  sendToWindows('app-preferences', getAppPreferences())
}

const syncAppVersionInfo = () => {
  sendToWindows('app-version-info', desktopClient.getAppVersionInfo())
}

const syncAppUpdateState = () => {
  sendToWindows('app-update-state', appUpdater.getState())
}

const setAppPreferences = (preferences: AppPreferences) => {
  appPreferences = {
    minimizeToTray: Boolean(preferences.minimizeToTray),
    openAtLogin: Boolean(preferences.openAtLogin),
  }

  applyOpenAtLogin()
  saveAppPreferences()
  syncAppPreferences()
}

const showControlWindow = () => {
  windows.showControlWindow()
}

const skipCurrentDrop = () => {
  windows.sendToOverlay('skip-current-drop', null)
  sendToWindows('test-drop-cleared', null)
}

const completeCurrentDrop = (dropId: string) => {
  desktopClient.completeDrop(dropId)
}

const stopCurrentDropForEveryone = () => {
  desktopClient.stopCurrentDropForEveryone()
}

const shortcutManager = createShortcutManager({
  loadShortcuts: () => getConfigStore().getShortcutConfigMap(),
  saveShortcuts: (shortcuts) => getConfigStore().saveShortcutConfigs(shortcuts),
  getActionHandlers: () => ({
    toggleDrops: () => setDropsEnabled(!dropsEnabled),
    skipDrop: skipCurrentDrop,
    toggleOwnDrops: () => setHideOwnDrops(!hideOwnDrops),
    stopGlobalDrop: stopCurrentDropForEveryone,
  }),
  onStatusChanged: (status) => {
    sendToWindows('shortcut-status', status)
  },
  onConfigsChanged: (shortcuts) => {
    sendToWindows('shortcut-configs', shortcuts)
  },
  onCaptureCancelled: () => {
    sendToWindows('shortcut-capture-cancelled', null)
  },
})

const appActions = createAppActions({
  setQuitting: () => {
    isQuitting = true
  },
})

const quitApp = appActions.quitApp
const uninstallApp = appActions.uninstallApp

const tray = createMemeDropTray({
  windowIcon,
  getDropsEnabled: () => dropsEnabled,
  getHideOwnDrops: () => hideOwnDrops,
  onShowControlWindow: showControlWindow,
  onToggleDrops: () => setDropsEnabled(!dropsEnabled),
  onToggleHideOwnDrops: () => setHideOwnDrops(!hideOwnDrops),
  onQuit: quitApp,
})

const windows = createMemeDropWindows({
  windowIcon,
  preloadPath: path.join(__dirname, 'preload.mjs'),
  renderer: rendererServer,
  getAppTitle,
  getOverlayTargetDisplay,
  getControlWindowBounds,
  getShouldStartControlHidden: () => shouldStartControlHidden,
  setShouldStartControlHidden: (hidden) => {
    shouldStartControlHidden = hidden
  },
  isQuitting: () => isQuitting,
  shouldHideControlOnClose: () => appPreferences.minimizeToTray,
  onQuitRequest: quitApp,
  onOverlayLoaded: () => {
    syncOverlayState()
    syncOverlayDisplayPreferences()
    syncOverlayDisplays()
    syncConnectionStatus()
    syncShortcutStatus()
    syncConnectedUsers()
  },
  onControlLoaded: () => {
    syncOverlayState()
    syncOverlayDisplayPreferences()
    syncOverlayDisplays()
    syncAppPreferences()
    syncAppVersionInfo()
    syncAppUpdateState()
    syncConnectionStatus()
    syncShortcutStatus()
    syncConnectedUsers()
  },
  shouldCaptureShortcutInput: () => shortcutManager.isCapturingShortcut(),
  onShortcutInput: (input) => {
    shortcutManager.captureShortcutInput(input)
  },
  onControlBoundsChanged: saveControlWindowBounds,
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !appPreferences.minimizeToTray) {
    quitApp()
    windows.clearWindowReferences()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!windows.hasAnyWindow()) {
    windows.createWindows()
  }
})

if (!hasInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showControlWindow()
  })
}

if (hasInstanceLock) app.whenReady().then(async () => {
  loadAppEnv()
  loadOverlayPreferences()
  loadAppPreferences()
  shortcutManager.loadShortcutConfigs()
  Menu.setApplicationMenu(null)
  if (!VITE_DEV_SERVER_URL) {
    await rendererServer.start()
  }
  screen.on('display-added', () => {
    syncOverlayDisplays()
    windows.keepOverlayAboveFullscreen()
  })
  screen.on('display-removed', () => {
    syncOverlayDisplays()
    windows.keepOverlayAboveFullscreen()
  })
  screen.on('display-metrics-changed', () => {
    syncOverlayDisplays()
    windows.keepOverlayAboveFullscreen()
  })
  powerMonitor.on('resume', () => {
    setConnectionStatus({
      level: 'info',
      message: 'Serveur MemeDrop : réveil du PC, reconnexion...',
    })
    desktopClient.scheduleReconnect()
  })
  windows.createWindows()
  tray.create()

  registerMemeDropIpcHandlers({
    setDropsEnabled: (enabled) => {
      setDropsEnabled(enabled)
      return getOverlayState()
    },
    setHideOwnDrops: (enabled) => {
      setHideOwnDrops(enabled)
      return getOverlayState()
    },
    getOverlayState,
    getOverlayDisplayPreferences,
    getOverlayDisplays,
    setOverlayDisplayPreferences: (preferences) => {
      const savedPreferences = saveOverlayDisplayPreferences(preferences)
      syncOverlayDisplayPreferences()
      windows.keepOverlayAboveFullscreen()
      return savedPreferences
    },
    getAppPreferences,
    getAppVersionInfo: desktopClient.getAppVersionInfo,
    getAppUpdateState: appUpdater.getState,
    checkForAppUpdate: appUpdater.checkForUpdates,
    downloadAppUpdate: appUpdater.downloadUpdate,
    installAppUpdate: appUpdater.installUpdate,
    getTikTokPreloadUrl,
    openReleasePage: () => {
      void shell.openExternal(desktopClient.getAppVersionInfo().releaseUrl)
    },
    setAppPreferences: (preferences) => {
      setAppPreferences(preferences)
      return getAppPreferences()
    },
    quitApp,
    uninstallApp,
    getConnectionStatus: () => connectionStatus,
    getShortcutStatus: shortcutManager.getShortcutStatus,
    getShortcutConfigs: shortcutManager.getShortcutConfigs,
    startShortcutCapture: shortcutManager.startShortcutCapture,
    setShortcutCaptureMode: shortcutManager.setShortcutCaptureMode,
    setShortcutConfigs: shortcutManager.setShortcutConfigs,
    resetShortcutConfigs: shortcutManager.resetShortcutConfigs,
    getConnectedUsers: desktopClient.getConnectedUsers,
    getServerConfig,
    saveServerConfig: (config) => {
      const savedConfig = saveServerConfig(config)
      desktopClient.startOrRestart()
      void appUpdater.checkForUpdates()
      return savedConfig
    },
    authenticateDiscord: discordAuth.authenticateDiscord,
    disconnectDiscord: discordAuth.disconnectDiscord,
    toggleDrops: () => {
      setDropsEnabled(!dropsEnabled)
      return getOverlayState()
    },
    toggleHideOwnDrops: () => {
      setHideOwnDrops(!hideOwnDrops)
      return getOverlayState()
    },
    skipCurrentDrop,
    completeCurrentDrop,
    stopCurrentDropForEveryone,
    emitTestDrop: (drop) => {
      if (!dropsEnabled) {
        return
      }
      windows.sendToOverlay('drop-received', drop)
    },
    clearTestDrop: () => {
      sendToWindows('test-drop-cleared', null)
    },
  })

  shortcutManager.registerGlobalShortcuts()
  desktopClient.startOrRestart()
  void appUpdater.checkForUpdates()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  windows.dispose()
  tray.destroy()
  rendererServer.close()
  shortcutManager.dispose()
  desktopClient.dispose()
})
