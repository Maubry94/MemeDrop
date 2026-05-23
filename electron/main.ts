import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { startMemeDropClient } from './memedropClient'
import type {
  ConnectionStatus,
  Drop,
  OverlayState,
  ServerConfig,
  ShortcutStatus,
} from '../src/shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ID = 'com.memedrop.app'

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

let overlayWindow: BrowserWindow | null = null
let controlWindow: BrowserWindow | null = null
let dropsEnabled = true
let connectionStatus: ConnectionStatus | null = null
let stopMemeDropClient: (() => void) | null = null
let shortcutStatus: ShortcutStatus[] = []
let overlayKeepAliveTimer: ReturnType<typeof setInterval> | null = null

type AppConfigFile = {
  discord?: Record<string, unknown>
  server?: Partial<ServerConfig>
}

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

const getConfigPath = () => path.join(app.getPath('userData'), 'config.json')

const readAppConfig = (): AppConfigFile => {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as AppConfigFile
  } catch (error) {
    console.error('Configuration MemeDrop illisible:', error)
    return {}
  }
}

const normalizeServerConfig = (config: ServerConfig): ServerConfig => ({
  serverUrl: config.serverUrl.trim(),
  accessKey: config.accessKey.trim(),
})

const getServerConfig = (): ServerConfig => {
  const stored = readAppConfig().server ?? {}

  return {
    serverUrl: stored.serverUrl ?? process.env.MEMEDROP_SERVER_URL ?? '',
    accessKey: stored.accessKey ?? process.env.MEMEDROP_SERVER_KEY ?? '',
  }
}

const saveServerConfig = (config: ServerConfig): ServerConfig => {
  const nextConfig = {
    ...readAppConfig(),
    server: normalizeServerConfig(config),
  }

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(nextConfig, null, 2), 'utf8')

  return nextConfig.server
}

const startOrRestartMemeDropClient = () => {
  stopMemeDropClient?.()
  stopMemeDropClient = null

  const { serverUrl, accessKey } = getServerConfig()

  stopMemeDropClient = startMemeDropClient({
    serverUrl,
    accessKey,
    onDrop: (drop: Drop) => {
      if (!dropsEnabled) {
        return
      }
      keepOverlayAboveFullscreen()
      overlayWindow?.webContents.send('drop-received', drop)
    },
    onStatus: (status: ConnectionStatus) => {
      setConnectionStatus(status)
    },
  })
}

const getOverlayState = (): OverlayState => ({
  dropsEnabled,
})

const getShortcutStatus = () => shortcutStatus

const sendToWindows = (channel: string, payload: unknown) => {
  overlayWindow?.webContents.send(channel, payload)
  controlWindow?.webContents.send(channel, payload)
}

const keepOverlayAboveFullscreen = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return
  }

  overlayWindow.setBounds(screen.getPrimaryDisplay().bounds)
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.showInactive()
  overlayWindow.moveTop()
}

const startOverlayKeepAlive = () => {
  if (overlayKeepAliveTimer) {
    return
  }

  overlayKeepAliveTimer = setInterval(keepOverlayAboveFullscreen, 1000)
}

const stopOverlayKeepAlive = () => {
  if (!overlayKeepAliveTimer) {
    return
  }

  clearInterval(overlayKeepAliveTimer)
  overlayKeepAliveTimer = null
}

const syncOverlayState = () => {
  sendToWindows('overlay-state', getOverlayState())
}

const syncConnectionStatus = () => {
  if (!connectionStatus) {
    return
  }
  sendToWindows('connection-status', connectionStatus)
}

const syncShortcutStatus = () => {
  sendToWindows('shortcut-status', getShortcutStatus())
}

const setConnectionStatus = (status: ConnectionStatus) => {
  connectionStatus = status
  sendToWindows('connection-status', status)
}

const setDropsEnabled = (enabled: boolean) => {
  dropsEnabled = enabled
  syncOverlayState()
}

const skipCurrentDrop = () => {
  overlayWindow?.webContents.send('skip-current-drop')
}

const registerGlobalShortcuts = () => {
  globalShortcut.unregisterAll()

  shortcutStatus = [
    {
      accelerator: 'CommandOrControl+Shift+D',
      label: 'Activer/désactiver les drops',
      registered: globalShortcut.register('CommandOrControl+Shift+D', () => {
        setDropsEnabled(!dropsEnabled)
      }),
    },
    {
      accelerator: 'CommandOrControl+Shift+S',
      label: 'Couper le drop actuel',
      registered: globalShortcut.register('CommandOrControl+Shift+S', skipCurrentDrop),
    },
  ]

  for (const shortcut of shortcutStatus) {
    if (!shortcut.registered) {
      console.warn(`Raccourci non enregistré: ${shortcut.accelerator}`)
    }
  }

  syncShortcutStatus()
}

const loadView = (window: BrowserWindow, view: 'overlay' | 'control') => {
  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL)
    url.searchParams.set('view', view)
    window.loadURL(url.toString())
    return
  }

  window.loadFile(path.join(RENDERER_DIST, 'index.html'), {
    query: { view },
  })
}

const createOverlayWindow = () => {
  const { width, height } = screen.getPrimaryDisplay().bounds
  overlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    icon: windowIcon,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  keepOverlayAboveFullscreen()
  startOverlayKeepAlive()
  overlayWindow.webContents.on('did-finish-load', () => {
    syncOverlayState()
    syncConnectionStatus()
    syncShortcutStatus()
    keepOverlayAboveFullscreen()
  })
  overlayWindow.on('closed', () => {
    overlayWindow = null
    stopOverlayKeepAlive()
  })

  loadView(overlayWindow, 'overlay')
}

const createControlWindow = () => {
  controlWindow = new BrowserWindow({
    width: 360,
    height: 620,
    minWidth: 320,
    minHeight: 560,
    resizable: true,
    minimizable: true,
    maximizable: false,
    backgroundColor: '#0f172a',
    icon: windowIcon,
    title: 'MemeDrop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  controlWindow.webContents.on('did-finish-load', () => {
    syncOverlayState()
    syncConnectionStatus()
    syncShortcutStatus()
  })
  controlWindow.on('closed', () => {
    controlWindow = null
  })

  loadView(controlWindow, 'control')
}

const createWindows = () => {
  createOverlayWindow()
  createControlWindow()
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    overlayWindow = null
    controlWindow = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows()
  }
})

if (!hasInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    controlWindow?.show()
    controlWindow?.focus()
  })
}

if (hasInstanceLock) app.whenReady().then(() => {
  loadAppEnv()
  Menu.setApplicationMenu(null)
  screen.on('display-added', keepOverlayAboveFullscreen)
  screen.on('display-removed', keepOverlayAboveFullscreen)
  screen.on('display-metrics-changed', keepOverlayAboveFullscreen)
  createWindows()

  ipcMain.handle('set-drops-enabled', (_event, enabled: boolean) => {
    setDropsEnabled(Boolean(enabled))
    return getOverlayState()
  })

  ipcMain.handle('get-overlay-state', () => getOverlayState())
  ipcMain.handle('get-connection-status', () => connectionStatus)
  ipcMain.handle('get-shortcut-status', () => getShortcutStatus())
  ipcMain.handle('get-server-config', () => getServerConfig())
  ipcMain.handle('save-server-config', (_event, config: ServerConfig) => {
    const savedConfig = saveServerConfig(config)
    startOrRestartMemeDropClient()
    return savedConfig
  })

  ipcMain.handle('toggle-drops', () => {
    setDropsEnabled(!dropsEnabled)
    return getOverlayState()
  })

  ipcMain.handle('skip-current-drop', () => {
    skipCurrentDrop()
  })

  ipcMain.handle('emit-test-drop', (_event, drop: Drop) => {
    if (!dropsEnabled) {
      return
    }
    overlayWindow?.webContents.send('drop-received', drop)
  })

  registerGlobalShortcuts()
  startOrRestartMemeDropClient()
})

app.on('will-quit', () => {
  stopOverlayKeepAlive()
  globalShortcut.unregisterAll()
  stopMemeDropClient?.()
  stopMemeDropClient = null
})
