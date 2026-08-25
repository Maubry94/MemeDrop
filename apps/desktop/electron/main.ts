import {
  app,
  Menu,
  powerMonitor,
  screen,
  shell,
} from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { createAppActions } from './core/appActions'
import { createAppUpdater } from './core/appUpdater'
import type { ControlWindowBounds } from './core/appConfig'
import {
  createConfigStore,
  normalizeOverlayDisplayPreferences,
} from './core/configStore'
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
  ActiveDropSnapshot,
  ConnectionStatus,
  AppPreferences,
  Drop,
  OverlayDisplayPreferences,
  OverlayState,
  ServerConnectionConfig,
  ServerConfig,
} from '../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const validateDevelopmentServerUrl = (value: string | undefined) => {
  if (!value?.trim()) {
    return undefined
  }

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('VITE_DEV_SERVER_URL doit être une URL HTTP locale valide.')
  }

  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.port !== '5173' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'VITE_DEV_SERVER_URL doit cibler exclusivement http://127.0.0.1:5173/.',
    )
  }

  return url.origin
}

export const VITE_DEV_SERVER_URL = app.isPackaged
  ? undefined
  : validateDevelopmentServerUrl(process.env['VITE_DEV_SERVER_URL'])
const APP_ID = 'com.memedrop.app'
const START_MINIMIZED_ARG = '--memedrop-start-minimized'
const OVERLAY_DISPLAY_PREFERENCES_SAVE_DELAY_MS = 150
const OVERLAY_DISPLAY_PREFERENCES_RETRY_DELAY_MS = 1_000
const OVERLAY_DISPLAY_PREFERENCES_MAX_RETRIES = 3

app.enableSandbox()
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

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const hasInstanceLock = app.requestSingleInstanceLock()

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST
const windowIcon = path.join(process.env.VITE_PUBLIC, 'memeDrop.png')
const getAppTitle = () => `MemeDrop v${app.getVersion()}`
const controlPreloadPath = path.join(__dirname, 'preload.mjs')
const overlayPreloadPath = path.join(__dirname, 'overlayPreload.mjs')
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
let currentTestDrop: Drop | null = null
let isQuitting = false
let shouldStartControlHidden = false
let overlayDisplayPreferences: OverlayDisplayPreferences | null = null
let overlayDisplayPreferencesDirty = false
let overlayDisplayPreferencesSaveFailures = 0
let overlayDisplayPreferencesSaveTimer: ReturnType<typeof setTimeout> | null = null

const loadAppEnv = () => {
  const candidates = [
    path.join(process.env.APP_ROOT, '.env'),
    path.join(path.dirname(process.execPath), '.env'),
    path.join(app.getPath('userData'), '.env'),
  ]

  for (const envPath of new Set(candidates.map((candidate) => path.resolve(candidate)))) {
    if (existsSync(envPath)) {
      loadEnv({ path: envPath, override: true, quiet: true })
    }
  }
}

const getServerConfig = (): ServerConfig => getConfigStore().getServerConfig()

const getServerConnectionConfig = (): ServerConnectionConfig =>
  getConfigStore().getServerConnectionConfig()

const saveServerConfig = (config: ServerConfig): ServerConfig => {
  return getConfigStore().saveServerConfig(config)
}

const saveOverlayPreferences = () => {
  getConfigStore().saveHideOwnDrops(hideOwnDrops)
}

const loadOverlayPreferences = () => {
  hideOwnDrops = getConfigStore().getHideOwnDrops()
  overlayDisplayPreferences = getConfigStore().getOverlayDisplayPreferences()
}

const getOverlayDisplayPreferences = (): OverlayDisplayPreferences => {
  overlayDisplayPreferences ??= getConfigStore().getOverlayDisplayPreferences()
  return { ...overlayDisplayPreferences }
}

const flushOverlayDisplayPreferences = () => {
  if (overlayDisplayPreferencesSaveTimer) {
    clearTimeout(overlayDisplayPreferencesSaveTimer)
    overlayDisplayPreferencesSaveTimer = null
  }

  if (!overlayDisplayPreferencesDirty || !overlayDisplayPreferences) {
    return
  }

  try {
    overlayDisplayPreferences = getConfigStore().saveOverlayDisplayPreferences(
      overlayDisplayPreferences,
    )
    overlayDisplayPreferencesDirty = false
    overlayDisplayPreferencesSaveFailures = 0
  } catch (error) {
    console.error("Enregistrement des préférences d'affichage impossible :", error)
    overlayDisplayPreferencesSaveFailures += 1
    if (
      !isQuitting &&
      overlayDisplayPreferencesSaveFailures <= OVERLAY_DISPLAY_PREFERENCES_MAX_RETRIES
    ) {
      overlayDisplayPreferencesSaveTimer = setTimeout(() => {
        overlayDisplayPreferencesSaveTimer = null
        flushOverlayDisplayPreferences()
      }, OVERLAY_DISPLAY_PREFERENCES_RETRY_DELAY_MS)
    }
  }
}

const scheduleOverlayDisplayPreferencesSave = () => {
  if (overlayDisplayPreferencesSaveTimer) {
    clearTimeout(overlayDisplayPreferencesSaveTimer)
  }

  overlayDisplayPreferencesSaveTimer = setTimeout(() => {
    overlayDisplayPreferencesSaveTimer = null
    flushOverlayDisplayPreferences()
  }, OVERLAY_DISPLAY_PREFERENCES_SAVE_DELAY_MS)
}

const updateOverlayDisplayPreferences = (
  preferences: OverlayDisplayPreferences,
): OverlayDisplayPreferences => {
  overlayDisplayPreferences = normalizeOverlayDisplayPreferences(preferences)
  overlayDisplayPreferencesDirty = true
  overlayDisplayPreferencesSaveFailures = 0
  scheduleOverlayDisplayPreferencesSave()
  return getOverlayDisplayPreferences()
}

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

const getControlWindowBounds = (
  bounds: Partial<ControlWindowBounds> = getConfigStore().getControlWindowBounds(),
): ControlWindowBounds => getSavedControlWindowBounds(screen, bounds)

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

const clearCurrentTestDrop = (): boolean => {
  if (!currentTestDrop) {
    return false
  }

  const clearedDropId = currentTestDrop.id
  currentTestDrop = null
  sendToWindows('test-drop-cleared', clearedDropId)
  return true
}

const syncServerConfig = (config = getServerConfig()) => {
  windows.sendToControl('server-config', config)
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
  getServerConfig: getServerConnectionConfig,
  getAppVersion: () => app.getVersion(),
  getDropsEnabled: () => dropsEnabled,
  getHideOwnDrops: () => hideOwnDrops,
  onConnectedUsers: (users) => {
    sendToWindows('connected-users', users)
  },
  onAppVersionInfo: (info) => {
    sendToWindows('app-version-info', info)
  },
  onIncomingDrop: clearCurrentTestDrop,
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
  onAuthenticationRejected: () => {
    try {
      syncServerConfig(getConfigStore().clearDiscordAuthentication())
    } catch (error) {
      console.error("Révocation locale de l'authentification Discord impossible:", error)
    }
  },
})

const appUpdater = createAppUpdater({
  enabled: __MEMEDROP_AUTO_UPDATE_ENABLED__,
  feedUrl: __MEMEDROP_UPDATE_FEED_URL__,
  getCurrentVersion: () => app.getVersion(),
  onStateChanged: (state) => {
    sendToWindows('app-update-state', state)
  },
})

const discordAuth = createDiscordAuth({
  getServerConfig,
  saveDiscordAuthentication: (...args) =>
    getConfigStore().saveDiscordAuthentication(...args),
  clearDiscordAuthentication: () => getConfigStore().clearDiscordAuthentication(),
  openExternal: (url) => shell.openExternal(url),
  onConfigChanged: desktopClient.startOrRestart,
})

const setDropsEnabled = (enabled: boolean) => {
  dropsEnabled = enabled
  if (!enabled) {
    clearCurrentTestDrop()
  }
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

const getActiveDropSnapshot = (view: 'control' | 'overlay'): ActiveDropSnapshot => {
  const serverDrop =
    view === 'overlay' ? desktopClient.getPresentedDrop() : desktopClient.getCurrentDrop()
  return {
    serverDrop,
    serverDropPresented: Boolean(desktopClient.getPresentedDrop()),
    testDrop: serverDrop || !currentTestDrop ? null : { ...currentTestDrop },
  }
}

const skipCurrentDrop = (expectedDropId?: string): boolean => {
  let skipped = false

  if (currentTestDrop && (!expectedDropId || currentTestDrop.id === expectedDropId)) {
    skipped = clearCurrentTestDrop()
  }

  const serverDropId = desktopClient.getCurrentDropId()
  if (serverDropId && (!expectedDropId || serverDropId === expectedDropId)) {
    const accepted = desktopClient.completeDrop(serverDropId)
    if (accepted) {
      windows.sendToOverlay('clear-drop', null)
      windows.sendToControl('skip-current-drop', serverDropId)
    } else {
      // The overlay keeps the drop and retries the ID-safe acknowledgement.
      windows.sendToOverlay('skip-current-drop', serverDropId)
    }
    skipped = accepted || skipped
  }
  return skipped
}

const completeCurrentDrop = (dropId: string): boolean => {
  const accepted = desktopClient.completeDrop(dropId)
  if (accepted) {
    windows.sendToControl('skip-current-drop', dropId)
  }
  return accepted
}

const stopCurrentDropForEveryone = (expectedDropId?: string): boolean =>
  desktopClient.stopCurrentDropForEveryone(expectedDropId)

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
  controlPreloadPath,
  overlayPreloadPath,
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
  onControlWindowDeactivated: () => {
    shortcutManager.cancelShortcutCapture()
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
  await windows.prepareRendererSession()
  screen.on('display-added', () => {
    syncOverlayDisplays()
    windows.keepOverlayAboveFullscreen()
  })
  screen.on('display-removed', () => {
    syncOverlayDisplays()
    windows.keepOverlayAboveFullscreen()
    windows.ensureControlWindowVisible()
  })
  screen.on('display-metrics-changed', () => {
    syncOverlayDisplays()
    windows.keepOverlayAboveFullscreen()
    windows.ensureControlWindowVisible()
  })
  powerMonitor.on('resume', () => {
    setConnectionStatus({
      state: 'reconnecting',
      reason: 'computer-resumed',
      level: 'info',
      message: 'Serveur MemeDrop : réveil du PC, reconnexion...',
    })
    desktopClient.scheduleReconnect()
  })
  registerMemeDropIpcHandlers({
    isControlSender: windows.isControlSender,
    isOverlaySender: windows.isOverlaySender,
    setDropsEnabled: (enabled) => {
      setDropsEnabled(enabled)
      return getOverlayState()
    },
    setHideOwnDrops: (enabled) => {
      setHideOwnDrops(enabled)
      return getOverlayState()
    },
    getOverlayState,
    getActiveDropSnapshot,
    getOverlayDisplayPreferences,
    getOverlayDisplays,
    setOverlayDisplayPreferences: (preferences) => {
      const previousDisplayId = getOverlayDisplayPreferences().displayId
      const updatedPreferences = updateOverlayDisplayPreferences(preferences)
      windows.sendToOverlay('overlay-display-preferences', updatedPreferences)
      if (updatedPreferences.displayId !== previousDisplayId) {
        windows.keepOverlayAboveFullscreen()
      }
      return updatedPreferences
    },
    getAppPreferences,
    getAppVersionInfo: desktopClient.getAppVersionInfo,
    getAppUpdateState: appUpdater.getState,
    checkForAppUpdate: appUpdater.checkForUpdates,
    downloadAppUpdate: appUpdater.downloadUpdate,
    installAppUpdate: appUpdater.installUpdate,
    openReleasePage: () => {
      void shell.openExternal(desktopClient.getAppVersionInfo().releaseUrl)
    },
    setAppPreferences: (preferences) => {
      setAppPreferences(preferences)
      return getAppPreferences()
    },
    getControlPanelSectionState: () =>
      getConfigStore().getControlPanelSectionState(),
    setControlPanelSectionOpen: (sectionId, open) =>
      getConfigStore().setControlPanelSectionOpen(sectionId, open),
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
      if (
        !dropsEnabled ||
        desktopClient.getCurrentDropId() ||
        !/^memedrop-test-preview-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          drop.id,
        ) ||
        drop.url !== 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif' ||
        drop.contentType !== 'image/gif'
      ) {
        return false
      }

      currentTestDrop = { ...drop }
      windows.keepOverlayAboveFullscreen()
      sendToWindows('test-drop-received', currentTestDrop)
      return true
    },
    clearTestDrop: (dropId) => {
      if (currentTestDrop?.id !== dropId) {
        return false
      }

      return clearCurrentTestDrop()
    },
  })

  windows.createWindows()
  tray.create()
  shortcutManager.registerGlobalShortcuts()
  desktopClient.startOrRestart()
  void appUpdater.checkForUpdates()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  flushOverlayDisplayPreferences()
  windows.dispose()
  tray.destroy()
  rendererServer.close()
  shortcutManager.dispose()
  desktopClient.dispose()
})
