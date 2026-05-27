import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, shell, Tray } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import http from 'node:http'
import { config as loadEnv } from 'dotenv'
import { startMemeDropClient } from './memedropClient'
import type { MemeDropClientController } from './memedropClient'
import type {
  ConnectionStatus,
  DiscordUser,
  Drop,
  AppPreferences,
  OverlayState,
  ServerConfig,
  ShortcutStatus,
} from '../src/shared/types'

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

let overlayWindow: BrowserWindow | null = null
let controlWindow: BrowserWindow | null = null
let tray: Tray | null = null
let dropsEnabled = true
let hideOwnDrops = false
let appPreferences: AppPreferences = {
  minimizeToTray: false,
  openAtLogin: false,
}
let connectionStatus: ConnectionStatus | null = null
let memeDropClient: MemeDropClientController | null = null
let currentServerDrop: Drop | null = null
let shortcutStatus: ShortcutStatus[] = []
let overlayKeepAliveTimer: ReturnType<typeof setInterval> | null = null
let isQuitting = false
let rendererServer: http.Server | null = null
let rendererServerUrl: string | null = null
let shouldStartControlHidden = false

type AppConfigFile = {
  discord?: Record<string, unknown>
  server?: Partial<ServerConfig>
  overlay?: Partial<Pick<OverlayState, 'hideOwnDrops'>>
  app?: Partial<AppPreferences>
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
  discordUserId: config.discordUserId.trim(),
  discordUserName: config.discordUserName.trim(),
  discordUserAvatarUrl: config.discordUserAvatarUrl?.trim() || null,
})

const getServerConfig = (): ServerConfig => {
  const stored = readAppConfig().server ?? {}

  return {
    serverUrl: stored.serverUrl ?? process.env.MEMEDROP_SERVER_URL ?? '',
    accessKey: stored.accessKey ?? process.env.MEMEDROP_SERVER_KEY ?? '',
    discordUserId: stored.discordUserId ?? process.env.DISCORD_USER_ID ?? '',
    discordUserName: stored.discordUserName ?? '',
    discordUserAvatarUrl: stored.discordUserAvatarUrl ?? null,
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

const saveOverlayPreferences = () => {
  const nextConfig = {
    ...readAppConfig(),
    overlay: {
      ...readAppConfig().overlay,
      hideOwnDrops,
    },
  }

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(nextConfig, null, 2), 'utf8')
}

const loadOverlayPreferences = () => {
  hideOwnDrops = Boolean(readAppConfig().overlay?.hideOwnDrops)
}

const saveAppPreferences = () => {
  const nextConfig = {
    ...readAppConfig(),
    app: appPreferences,
  }

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(nextConfig, null, 2), 'utf8')
}

const applyOpenAtLogin = () => {
  app.setLoginItemSettings({
    openAtLogin: appPreferences.openAtLogin,
    args:
      appPreferences.openAtLogin && appPreferences.minimizeToTray ? [START_MINIMIZED_ARG] : [],
  })
}

const loadAppPreferences = () => {
  const stored = readAppConfig().app ?? {}

  appPreferences = {
    minimizeToTray: Boolean(stored.minimizeToTray),
    openAtLogin: Boolean(stored.openAtLogin),
  }
  shouldStartControlHidden =
    appPreferences.minimizeToTray &&
    (process.argv.includes(START_MINIMIZED_ARG) || app.getLoginItemSettings().wasOpenedAtLogin)

  applyOpenAtLogin()
}

const toServerHttpUrl = (serverUrl: string) => {
  const normalizedUrl = serverUrl.match(/^https?:\/\//i) ? serverUrl : `https://${serverUrl}`
  return new URL(normalizedUrl)
}

const withServerKey = (url: URL, accessKey: string) => {
  if (accessKey) {
    url.searchParams.set('key', accessKey)
  }

  return url
}

type DiscordAuthStartResponse = {
  sessionId: string
  authUrl: string
}

type DiscordAuthStatusResponse =
  | {
      status: 'pending' | 'expired'
    }
  | {
      status: 'done'
      user: DiscordUser
    }

const requestJson = async <T>(url: URL, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options)

  if (!response.ok) {
    const body = await response.text()
    let message = body

    try {
      const json = JSON.parse(body) as { error?: string }
      message = json.error ?? body
    } catch {
      // Keep the raw response body when the server did not return JSON.
    }

    throw new Error(message || `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const authenticateDiscord = async (): Promise<ServerConfig> => {
  const config = getServerConfig()

  if (!config.serverUrl) {
    throw new Error('URL du serveur manquante.')
  }

  const serverUrl = toServerHttpUrl(config.serverUrl)
  const startUrl = withServerKey(new URL('/auth/discord/session', serverUrl), config.accessKey)
  const start = await requestJson<DiscordAuthStartResponse>(startUrl, {
    method: 'POST',
  })

  await shell.openExternal(start.authUrl)

  for (let attempt = 0; attempt < 150; attempt += 1) {
    await sleep(1000)

    const statusUrl = withServerKey(
      new URL(`/auth/discord/session/${start.sessionId}`, serverUrl),
      config.accessKey,
    )
    const status = await requestJson<DiscordAuthStatusResponse>(statusUrl)

    if (status.status === 'done') {
      const savedConfig = saveServerConfig({
        ...config,
        discordUserId: status.user.id,
        discordUserName: status.user.username,
        discordUserAvatarUrl: status.user.avatarUrl,
      })
      startOrRestartMemeDropClient()
      return savedConfig
    }

    if (status.status === 'expired') {
      throw new Error('Session Discord expirée.')
    }
  }

  throw new Error('Connexion Discord expirée.')
}

const disconnectDiscord = (): ServerConfig => {
  const config = getServerConfig()
  const savedConfig = saveServerConfig({
    ...config,
    discordUserId: '',
    discordUserName: '',
    discordUserAvatarUrl: null,
  })
  startOrRestartMemeDropClient()
  return savedConfig
}

const startOrRestartMemeDropClient = () => {
  memeDropClient?.stop()
  memeDropClient = null

  const { serverUrl, accessKey, discordUserId } = getServerConfig()

  memeDropClient = startMemeDropClient({
    serverUrl,
    accessKey,
    userId: discordUserId,
    onDrop: (drop: Drop) => {
      currentServerDrop = drop
      if (!dropsEnabled) {
        memeDropClient?.completeDrop(drop.id)
        return
      }
      if (!discordUserId) {
        memeDropClient?.completeDrop(drop.id)
        return
      }
      if (hideOwnDrops && discordUserId && drop.authorId === discordUserId) {
        controlWindow?.webContents.send('drop-received', drop)
        memeDropClient?.completeDrop(drop.id)
        return
      }
      keepOverlayAboveFullscreen()
      sendToWindows('drop-received', drop)
    },
    onClearDrop: () => {
      currentServerDrop = null
      sendToWindows('clear-drop', null)
    },
    onStatus: (status: ConnectionStatus) => {
      setConnectionStatus(status)
    },
  })
}

const getOverlayState = (): OverlayState => ({
  dropsEnabled,
  hideOwnDrops,
})

const getAppPreferences = (): AppPreferences => ({ ...appPreferences })

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
  updateTrayMenu()
  syncOverlayState()
}

const setHideOwnDrops = (enabled: boolean) => {
  hideOwnDrops = enabled
  saveOverlayPreferences()
  updateTrayMenu()
  syncOverlayState()
}

const syncAppPreferences = () => {
  sendToWindows('app-preferences', getAppPreferences())
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
  if (!controlWindow || controlWindow.isDestroyed()) {
    createControlWindow()
    return
  }

  if (controlWindow.isMinimized()) {
    controlWindow.restore()
  }

  controlWindow.show()
  controlWindow.focus()
}

const skipCurrentDrop = () => {
  overlayWindow?.webContents.send('skip-current-drop')
}

const completeCurrentDrop = (dropId: string) => {
  memeDropClient?.completeDrop(dropId)
}

const stopCurrentDropForEveryone = () => {
  if (!currentServerDrop) {
    return
  }
  memeDropClient?.stopDrop(currentServerDrop.id)
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
    {
      accelerator: 'CommandOrControl+Shift+M',
      label: 'Afficher/masquer mes drops',
      registered: globalShortcut.register('CommandOrControl+Shift+M', () => {
        setHideOwnDrops(!hideOwnDrops)
      }),
    },
    {
      accelerator: 'CommandOrControl+Shift+X',
      label: 'Couper le drop pour tout le monde',
      registered: globalShortcut.register('CommandOrControl+Shift+X', stopCurrentDropForEveryone),
    },
  ]

  for (const shortcut of shortcutStatus) {
    if (!shortcut.registered) {
      console.warn(`Raccourci non enregistré: ${shortcut.accelerator}`)
    }
  }

  syncShortcutStatus()
}

const quitApp = () => {
  isQuitting = true
  app.quit()
}

const updateTrayMenu = () => {
  if (!tray) {
    return
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Afficher MemeDrop',
        click: showControlWindow,
      },
      {
        label: dropsEnabled ? 'Desactiver les drops' : 'Activer les drops',
        click: () => setDropsEnabled(!dropsEnabled),
      },
      {
        label: hideOwnDrops ? 'Voir mes drops' : 'Masquer mes drops',
        click: () => setHideOwnDrops(!hideOwnDrops),
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: quitApp,
      },
    ]),
  )
}

const createTray = () => {
  if (tray) {
    return
  }

  tray = new Tray(windowIcon)
  tray.setToolTip('MemeDrop')
  tray.on('click', showControlWindow)
  updateTrayMenu()
}

const getContentType = (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase()

  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    case '.json':
      return 'application/json; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

const startRendererServer = () =>
  new Promise<string>((resolve, reject) => {
    if (rendererServerUrl) {
      resolve(rendererServerUrl)
      return
    }

    rendererServer = http.createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
      const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname
      const filePath = path.normalize(path.join(RENDERER_DIST, decodeURIComponent(requestedPath)))

      if (!filePath.startsWith(RENDERER_DIST)) {
        response.writeHead(403)
        response.end()
        return
      }

      try {
        const stat = statSync(filePath)

        if (!stat.isFile()) {
          response.writeHead(404)
          response.end()
          return
        }

        response.writeHead(200, {
          'content-type': getContentType(filePath),
        })
        createReadStream(filePath).pipe(response)
      } catch {
        response.writeHead(404)
        response.end()
      }
    })

    rendererServer.once('error', reject)
    rendererServer.listen(0, 'localhost', () => {
      const address = rendererServer?.address()

      if (!address || typeof address === 'string') {
        reject(new Error('Adresse du serveur renderer invalide.'))
        return
      }

      rendererServerUrl = `http://localhost:${address.port}`
      resolve(rendererServerUrl)
    })
  })

const loadView = (window: BrowserWindow, view: 'overlay' | 'control') => {
  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL)
    url.searchParams.set('view', view)
    window.loadURL(url.toString())
    return
  }

  if (!rendererServerUrl) {
    throw new Error('Le serveur renderer MemeDrop n’est pas démarré.')
  }

  const url = new URL(rendererServerUrl)
  url.searchParams.set('view', view)
  window.loadURL(url.toString())
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
  overlayWindow.setIgnoreMouseEvents(true)
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
    height: 564,
    minWidth: 360,
    minHeight: 564,
    resizable: true,
    minimizable: true,
    maximizable: false,
    show: !shouldStartControlHidden,
    backgroundColor: '#0f172a',
    icon: windowIcon,
    title: getAppTitle(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  controlWindow.webContents.on('did-finish-load', () => {
    controlWindow?.setTitle(getAppTitle())
    syncOverlayState()
    syncAppPreferences()
    syncConnectionStatus()
    syncShortcutStatus()
  })
  controlWindow.on('close', (event) => {
    if (isQuitting) {
      return
    }

    if (appPreferences.minimizeToTray) {
      event.preventDefault()
      controlWindow?.hide()
      return
    }

    quitApp()
  })
  controlWindow.on('closed', () => {
    controlWindow = null
  })

  loadView(controlWindow, 'control')
  shouldStartControlHidden = false
}

const createWindows = () => {
  createOverlayWindow()
  createControlWindow()
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !appPreferences.minimizeToTray) {
    quitApp()
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
    showControlWindow()
  })
}

if (hasInstanceLock) app.whenReady().then(async () => {
  loadAppEnv()
  loadOverlayPreferences()
  loadAppPreferences()
  Menu.setApplicationMenu(null)
  if (!VITE_DEV_SERVER_URL) {
    await startRendererServer()
  }
  screen.on('display-added', keepOverlayAboveFullscreen)
  screen.on('display-removed', keepOverlayAboveFullscreen)
  screen.on('display-metrics-changed', keepOverlayAboveFullscreen)
  createWindows()
  createTray()

  ipcMain.handle('set-drops-enabled', (_event, enabled: boolean) => {
    setDropsEnabled(Boolean(enabled))
    return getOverlayState()
  })

  ipcMain.handle('set-hide-own-drops', (_event, enabled: boolean) => {
    setHideOwnDrops(Boolean(enabled))
    return getOverlayState()
  })

  ipcMain.handle('get-overlay-state', () => getOverlayState())
  ipcMain.handle('get-app-preferences', () => getAppPreferences())
  ipcMain.handle('set-app-preferences', (_event, preferences: AppPreferences) => {
    setAppPreferences(preferences)
    return getAppPreferences()
  })
  ipcMain.handle('get-connection-status', () => connectionStatus)
  ipcMain.handle('get-shortcut-status', () => getShortcutStatus())
  ipcMain.handle('get-server-config', () => getServerConfig())
  ipcMain.handle('save-server-config', (_event, config: ServerConfig) => {
    const savedConfig = saveServerConfig(config)
    startOrRestartMemeDropClient()
    return savedConfig
  })

  ipcMain.handle('authenticate-discord', () => authenticateDiscord())

  ipcMain.handle('disconnect-discord', () => disconnectDiscord())

  ipcMain.handle('toggle-drops', () => {
    setDropsEnabled(!dropsEnabled)
    return getOverlayState()
  })

  ipcMain.handle('toggle-hide-own-drops', () => {
    setHideOwnDrops(!hideOwnDrops)
    return getOverlayState()
  })

  ipcMain.handle('skip-current-drop', () => {
    skipCurrentDrop()
  })

  ipcMain.handle('complete-current-drop', (_event, dropId: string) => {
    completeCurrentDrop(dropId)
  })

  ipcMain.handle('stop-current-drop-for-everyone', () => {
    stopCurrentDropForEveryone()
  })

  ipcMain.handle('emit-test-drop', (_event, drop: Drop) => {
    if (!dropsEnabled) {
      return
    }
    overlayWindow?.webContents.send('drop-received', drop)
  })

  ipcMain.handle('clear-test-drop', () => {
    overlayWindow?.webContents.send('test-drop-cleared')
  })

  registerGlobalShortcuts()
  startOrRestartMemeDropClient()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  stopOverlayKeepAlive()
  tray?.destroy()
  tray = null
  rendererServer?.close()
  rendererServer = null
  rendererServerUrl = null
  globalShortcut.unregisterAll()
  memeDropClient?.stop()
  memeDropClient = null
})
