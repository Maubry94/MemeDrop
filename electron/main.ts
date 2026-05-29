import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  powerMonitor,
  screen,
  shell,
  Tray,
} from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
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
  AppVersionInfo,
  ConnectedUser,
  OverlayDisplayPreferences,
  OverlayDisplayInfo,
  OverlayState,
  ShortcutActionId,
  ShortcutConfig,
  ServerConfig,
  ShortcutStatus,
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

let overlayWindow: BrowserWindow | null = null
let controlWindow: BrowserWindow | null = null
let tray: Tray | null = null
let dropsEnabled = true
let hideOwnDrops = false
let connectedUsers: ConnectedUser[] = []
let appVersionInfo: AppVersionInfo = {
  currentVersion: app.getVersion(),
  latestVersion: app.getVersion(),
  updateAvailable: false,
  releaseUrl: `https://github.com/Maubry94/MemeDrop/releases/tag/${app.getVersion()}`,
}
let appPreferences: AppPreferences = {
  minimizeToTray: false,
  openAtLogin: false,
}
let connectionStatus: ConnectionStatus | null = null
let memeDropClient: MemeDropClientController | null = null
let currentServerDrop: Drop | null = null
let shortcutStatus: ShortcutStatus[] = []
let shortcutConfigs: ShortcutConfig[] = []
let shortcutCaptureAction: ShortcutActionId | null = null
let overlayKeepAliveTimer: ReturnType<typeof setInterval> | null = null
let controlWindowBoundsSaveTimer: ReturnType<typeof setTimeout> | null = null
let resumeReconnectTimer: ReturnType<typeof setTimeout> | null = null
let isQuitting = false
let rendererServer: http.Server | null = null
let rendererServerUrl: string | null = null
let shouldStartControlHidden = false

type ControlWindowBounds = {
  x?: number
  y?: number
  width: number
  height: number
}

type AppConfigFile = {
  discord?: Record<string, unknown>
  server?: Partial<ServerConfig>
  overlay?: Partial<Pick<OverlayState, 'hideOwnDrops'> & OverlayDisplayPreferences>
  app?: Partial<AppPreferences>
  shortcuts?: Partial<Record<ShortcutActionId, string>>
  controlWindow?: Partial<ControlWindowBounds>
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

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  {
    action: 'toggleDrops',
    accelerator: 'CommandOrControl+Shift+D',
  },
  {
    action: 'skipDrop',
    accelerator: 'CommandOrControl+Shift+S',
  },
  {
    action: 'toggleOwnDrops',
    accelerator: 'CommandOrControl+Shift+M',
  },
  {
    action: 'stopGlobalDrop',
    accelerator: 'CommandOrControl+Shift+X',
  },
]

const SHORTCUT_LABELS: Record<ShortcutActionId, string> = {
  toggleDrops: 'Activer/désactiver les drops',
  skipDrop: 'Couper le drop actuel',
  toggleOwnDrops: 'Afficher/masquer mes drops',
  stopGlobalDrop: 'Couper le drop pour tout le monde',
}

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

const getOverlayDisplayPreferences = (): OverlayDisplayPreferences => {
  const stored = readAppConfig().overlay ?? {}

  return {
    displayId: String(stored.displayId ?? 'primary'),
    position: stored.position ?? 'full',
    volume: Number(stored.volume ?? 100),
    size: Number(stored.size ?? 100),
    customX: Number(stored.customX ?? 50),
    customY: Number(stored.customY ?? 50),
    customAnchor: stored.customAnchor ?? 'full',
  }
}

const saveOverlayDisplayPreferences = (
  preferences: OverlayDisplayPreferences,
): OverlayDisplayPreferences => {
  const nextConfig = {
    ...readAppConfig(),
    overlay: {
      ...readAppConfig().overlay,
      displayId: preferences.displayId,
      position: preferences.position,
      volume: preferences.volume,
      size: preferences.size,
      customX: preferences.customX,
      customY: preferences.customY,
      customAnchor: preferences.customAnchor,
    },
  }

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(nextConfig, null, 2), 'utf8')

  return getOverlayDisplayPreferences()
}

const getOverlayDisplays = (): OverlayDisplayInfo[] => {
  const primaryDisplayId = String(screen.getPrimaryDisplay().id)

  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    label:
      display.id === screen.getPrimaryDisplay().id
        ? `Écran ${index + 1} (principal)`
        : `Écran ${index + 1}`,
    isPrimary: String(display.id) === primaryDisplayId,
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
  }))
}

const getOverlayTargetDisplay = () => {
  const preferences = getOverlayDisplayPreferences()
  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()

  if (preferences.displayId === 'primary') {
    return primaryDisplay
  }

  return displays.find((display) => String(display.id) === preferences.displayId) ?? primaryDisplay
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

const normalizeShortcutConfigs = (
  shortcuts: Partial<Record<ShortcutActionId, string>> = {},
): ShortcutConfig[] =>
  DEFAULT_SHORTCUTS.map((shortcut) => ({
    action: shortcut.action,
    accelerator: shortcuts[shortcut.action]?.trim() || shortcut.accelerator,
  }))

const loadShortcutConfigs = () => {
  shortcutConfigs = normalizeShortcutConfigs(readAppConfig().shortcuts)
}

const getShortcutConfigs = (): ShortcutConfig[] => shortcutConfigs.map((shortcut) => ({ ...shortcut }))

const saveShortcutConfigs = (shortcuts: ShortcutConfig[]) => {
  const normalizedShortcuts = normalizeShortcutConfigs(
    Object.fromEntries(
      shortcuts.map((shortcut) => [shortcut.action, shortcut.accelerator]),
    ) as Partial<Record<ShortcutActionId, string>>,
  )
  const nextConfig = {
    ...readAppConfig(),
    shortcuts: Object.fromEntries(
      normalizedShortcuts.map((shortcut) => [shortcut.action, shortcut.accelerator]),
    ) as Partial<Record<ShortcutActionId, string>>,
  }

  shortcutConfigs = normalizedShortcuts
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(nextConfig, null, 2), 'utf8')

  return getShortcutConfigs()
}

const resetShortcutConfigs = () => saveShortcutConfigs(DEFAULT_SHORTCUTS)

const getControlWindowBounds = (): ControlWindowBounds => {
  const stored = readAppConfig().controlWindow ?? {}
  const width = Number(stored.width)
  const height = Number(stored.height)
  const x = Number(stored.x)
  const y = Number(stored.y)
  const fallback: ControlWindowBounds = {
    width: 500,
    height: 800,
  }

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return fallback
  }

  const bounds: ControlWindowBounds = {
    width: Math.max(500, Math.round(width)),
    height: Math.max(800, Math.round(height)),
  }

  if (Number.isFinite(x) && Number.isFinite(y)) {
    bounds.x = Math.round(x)
    bounds.y = Math.round(y)
  }

  const matchingDisplay = screen.getDisplayMatching({
    x: bounds.x ?? 0,
    y: bounds.y ?? 0,
    width: bounds.width,
    height: bounds.height,
  })

  if (bounds.x === undefined || bounds.y === undefined) {
    return bounds
  }

  const visibleArea = matchingDisplay.workArea
  const hasVisibleCorner =
    bounds.x < visibleArea.x + visibleArea.width &&
    bounds.x + bounds.width > visibleArea.x &&
    bounds.y < visibleArea.y + visibleArea.height &&
    bounds.y + bounds.height > visibleArea.y

  return hasVisibleCorner ? bounds : fallback
}

const saveControlWindowBounds = () => {
  if (!controlWindow || controlWindow.isDestroyed() || controlWindow.isMinimized()) {
    return
  }

  const bounds = controlWindow.getNormalBounds()
  const nextConfig = {
    ...readAppConfig(),
    controlWindow: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  }

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(nextConfig, null, 2), 'utf8')
}

const scheduleControlWindowBoundsSave = () => {
  if (controlWindowBoundsSaveTimer) {
    clearTimeout(controlWindowBoundsSaveTimer)
  }

  controlWindowBoundsSaveTimer = setTimeout(() => {
    controlWindowBoundsSaveTimer = null
    saveControlWindowBounds()
  }, 400)
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

const compareAppVersions = (currentVersion: string, expectedVersion: string) => {
  const currentParts = currentVersion.split(/[.-]/).map((part) => Number(part))
  const expectedParts = expectedVersion.split(/[.-]/).map((part) => Number(part))
  const partsLength = Math.max(currentParts.length, expectedParts.length)

  for (let index = 0; index < partsLength; index += 1) {
    const currentPart = currentParts[index] ?? 0
    const expectedPart = expectedParts[index] ?? 0

    if (!Number.isFinite(currentPart) || !Number.isFinite(expectedPart)) {
      return currentVersion.localeCompare(expectedVersion)
    }
    if (currentPart !== expectedPart) {
      return currentPart - expectedPart
    }
  }

  return 0
}

const getReleaseUrl = (version: string) => {
  return `https://github.com/Maubry94/MemeDrop/releases/tag/${version}`
}

const setLatestAppVersion = (latestVersion: string) => {
  const currentVersion = app.getVersion()

  appVersionInfo = {
    currentVersion,
    latestVersion,
    updateAvailable: compareAppVersions(currentVersion, latestVersion) < 0,
    releaseUrl: getReleaseUrl(latestVersion),
  }

  sendToWindows('app-version-info', appVersionInfo)
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
  const serverConfig = getServerConfig()

  memeDropClient = startMemeDropClient({
    serverUrl,
    accessKey,
    userId: discordUserId,
    userName: serverConfig.discordUserName,
    userAvatarUrl: serverConfig.discordUserAvatarUrl,
    appVersion: app.getVersion(),
    dropsEnabled,
    onConnectedUsers: (users: ConnectedUser[], latestAppVersion: string) => {
      setLatestAppVersion(latestAppVersion)
      connectedUsers = users
      sendToWindows('connected-users', connectedUsers)
    },
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
      if (hideOwnDrops && discordUserId && (drop.ownerId ?? drop.authorId) === discordUserId) {
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

const scheduleMemeDropReconnect = () => {
  if (resumeReconnectTimer) {
    clearTimeout(resumeReconnectTimer)
  }

  resumeReconnectTimer = setTimeout(() => {
    resumeReconnectTimer = null
    startOrRestartMemeDropClient()
  }, 5000)
}

const getOverlayState = (): OverlayState => ({
  dropsEnabled,
  hideOwnDrops,
})

const getAppPreferences = (): AppPreferences => ({ ...appPreferences })

const getAppVersionInfo = (): AppVersionInfo => ({ ...appVersionInfo })

const getShortcutStatus = () => shortcutStatus

const getConnectedUsers = () => connectedUsers

const sendToWindows = (channel: string, payload: unknown) => {
  overlayWindow?.webContents.send(channel, payload)
  controlWindow?.webContents.send(channel, payload)
}

const keepOverlayAboveFullscreen = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return
  }

  overlayWindow.setBounds(getOverlayTargetDisplay().bounds)
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
  sendToWindows('shortcut-status', getShortcutStatus())
}

const syncConnectedUsers = () => {
  sendToWindows('connected-users', getConnectedUsers())
}

const setConnectionStatus = (status: ConnectionStatus) => {
  connectionStatus = status
  sendToWindows('connection-status', status)
}

const setDropsEnabled = (enabled: boolean) => {
  dropsEnabled = enabled
  memeDropClient?.updateDropsEnabled(dropsEnabled)
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

const syncAppVersionInfo = () => {
  sendToWindows('app-version-info', getAppVersionInfo())
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
  sendToWindows('test-drop-cleared', null)
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

  const shortcutHandlers: Record<ShortcutActionId, () => void> = {
    toggleDrops: () => setDropsEnabled(!dropsEnabled),
    skipDrop: skipCurrentDrop,
    toggleOwnDrops: () => setHideOwnDrops(!hideOwnDrops),
    stopGlobalDrop: stopCurrentDropForEveryone,
  }

  shortcutStatus = shortcutConfigs.map((shortcut) => ({
    ...shortcut,
    label: SHORTCUT_LABELS[shortcut.action],
    registered: globalShortcut.register(shortcut.accelerator, shortcutHandlers[shortcut.action]),
  }))

  for (const shortcut of shortcutStatus) {
    if (!shortcut.registered) {
      console.warn(`Raccourci non enregistré: ${shortcut.accelerator}`)
    }
  }

  syncShortcutStatus()
}

const setShortcutCaptureMode = (enabled: boolean) => {
  shortcutCaptureAction = null
  if (enabled) {
    globalShortcut.unregisterAll()
    return
  }

  registerGlobalShortcuts()
}

const getShortcutAcceleratorPart = (input: Electron.Input): string | null => {
  if (/^[a-z]$/i.test(input.key)) return input.key.toUpperCase()
  if (/^[0-9]$/.test(input.key)) return input.key
  if (/^F\d{1,2}$/i.test(input.key)) return input.key.toUpperCase()

  const specialKeys: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Escape: 'Escape',
  }

  return specialKeys[input.key] ?? null
}

const captureShortcutInput = (input: Electron.Input) => {
  if (!shortcutCaptureAction || input.type !== 'keyDown') {
    return
  }

  const key = getShortcutAcceleratorPart(input)
  if (!key) {
    return
  }

  if (key === 'Escape') {
    shortcutCaptureAction = null
    registerGlobalShortcuts()
    sendToWindows('shortcut-capture-cancelled', null)
    return
  }

  const modifiers: string[] = []
  if (input.control || input.meta) modifiers.push('CommandOrControl')
  if (input.alt) modifiers.push('Alt')
  if (input.shift) modifiers.push('Shift')

  if (!modifiers.length && !key.startsWith('F')) {
    return
  }

  const action = shortcutCaptureAction
  const accelerator = [...modifiers, key].join('+')
  const savedShortcuts = setShortcutConfigs(
    shortcutConfigs.map((shortcut) =>
      shortcut.action === action ? { ...shortcut, accelerator } : shortcut,
    ),
  )

  shortcutCaptureAction = null
  sendToWindows('shortcut-configs', savedShortcuts)
}

const startShortcutCapture = (action: ShortcutActionId) => {
  if (!SHORTCUT_LABELS[action]) {
    return getShortcutConfigs()
  }

  shortcutCaptureAction = action
  globalShortcut.unregisterAll()
  return getShortcutConfigs()
}

const setShortcutConfigs = (shortcuts: ShortcutConfig[]) => {
  const savedShortcuts = saveShortcutConfigs(shortcuts)
  registerGlobalShortcuts()
  return savedShortcuts
}

const quitApp = () => {
  isQuitting = true
  app.quit()
}

const uninstallApp = () => {
  if (!app.isPackaged) {
    throw new Error("La désinstallation est disponible uniquement sur l'application installée.")
  }

  const installDir = path.dirname(process.execPath)
  const candidates = [
    path.join(installDir, 'Uninstall MemeDrop.exe'),
    path.join(installDir, `Uninstall ${app.getName()}.exe`),
    path.join(installDir, 'Uninstall.exe'),
  ]
  const uninstaller = candidates.find((candidate) => existsSync(candidate))

  if (!uninstaller) {
    throw new Error("L'outil de désinstallation est introuvable.")
  }

  app.setLoginItemSettings({ openAtLogin: false, args: [] })
  isQuitting = true

  const child = spawn(uninstaller, [], {
    detached: true,
    stdio: 'ignore',
  })

  child.unref()
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
  const overlayDisplay = getOverlayTargetDisplay()
  const { width, height, x, y } = overlayDisplay.bounds
  overlayWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
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
    syncOverlayDisplayPreferences()
    syncOverlayDisplays()
    syncConnectionStatus()
    syncShortcutStatus()
    syncConnectedUsers()
    keepOverlayAboveFullscreen()
  })
  overlayWindow.on('closed', () => {
    overlayWindow = null
    stopOverlayKeepAlive()
  })

  loadView(overlayWindow, 'overlay')
}

const createControlWindow = () => {
  const controlWindowBounds = getControlWindowBounds()

  controlWindow = new BrowserWindow({
    ...controlWindowBounds,
    minWidth: 500,
    minHeight: 370,
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
    syncOverlayDisplayPreferences()
    syncOverlayDisplays()
    syncAppPreferences()
    syncAppVersionInfo()
    syncConnectionStatus()
    syncShortcutStatus()
    syncConnectedUsers()
  })
  controlWindow.webContents.on('before-input-event', (event, input) => {
    if (!shortcutCaptureAction) {
      return
    }

    event.preventDefault()
    captureShortcutInput(input)
  })
  controlWindow.on('close', (event) => {
    saveControlWindowBounds()

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
  controlWindow.on('resize', scheduleControlWindowBoundsSave)
  controlWindow.on('move', scheduleControlWindowBoundsSave)

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
  loadShortcutConfigs()
  Menu.setApplicationMenu(null)
  if (!VITE_DEV_SERVER_URL) {
    await startRendererServer()
  }
  screen.on('display-added', () => {
    syncOverlayDisplays()
    keepOverlayAboveFullscreen()
  })
  screen.on('display-removed', () => {
    syncOverlayDisplays()
    keepOverlayAboveFullscreen()
  })
  screen.on('display-metrics-changed', () => {
    syncOverlayDisplays()
    keepOverlayAboveFullscreen()
  })
  powerMonitor.on('resume', () => {
    setConnectionStatus({
      level: 'info',
      message: 'Serveur MemeDrop : réveil du PC, reconnexion...',
    })
    scheduleMemeDropReconnect()
  })
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
  ipcMain.handle('get-overlay-display-preferences', () => getOverlayDisplayPreferences())
  ipcMain.handle('get-overlay-displays', () => getOverlayDisplays())
  ipcMain.handle(
    'set-overlay-display-preferences',
    (_event, preferences: OverlayDisplayPreferences) => {
      const savedPreferences = saveOverlayDisplayPreferences(preferences)
      syncOverlayDisplayPreferences()
      keepOverlayAboveFullscreen()
      return savedPreferences
    },
  )
  ipcMain.handle('get-app-preferences', () => getAppPreferences())
  ipcMain.handle('get-app-version-info', () => getAppVersionInfo())
  ipcMain.handle('open-release-page', () => {
    void shell.openExternal(appVersionInfo.releaseUrl)
  })
  ipcMain.handle('set-app-preferences', (_event, preferences: AppPreferences) => {
    setAppPreferences(preferences)
    return getAppPreferences()
  })
  ipcMain.handle('quit-app', () => {
    quitApp()
  })
  ipcMain.handle('uninstall-app', () => {
    uninstallApp()
  })
  ipcMain.handle('get-connection-status', () => connectionStatus)
  ipcMain.handle('get-shortcut-status', () => getShortcutStatus())
  ipcMain.handle('get-shortcut-configs', () => getShortcutConfigs())
  ipcMain.handle('start-shortcut-capture', (_event, action: ShortcutActionId) =>
    startShortcutCapture(action),
  )
  ipcMain.handle('set-shortcut-capture-mode', (_event, enabled: boolean) => {
    setShortcutCaptureMode(Boolean(enabled))
  })
  ipcMain.handle('set-shortcut-configs', (_event, shortcuts: ShortcutConfig[]) =>
    setShortcutConfigs(shortcuts),
  )
  ipcMain.handle('reset-shortcut-configs', () => {
    const shortcuts = resetShortcutConfigs()
    registerGlobalShortcuts()
    return shortcuts
  })
  ipcMain.handle('get-connected-users', () => getConnectedUsers())
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
    sendToWindows('test-drop-cleared', null)
  })

  registerGlobalShortcuts()
  startOrRestartMemeDropClient()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  stopOverlayKeepAlive()
  if (controlWindowBoundsSaveTimer) {
    clearTimeout(controlWindowBoundsSaveTimer)
    controlWindowBoundsSaveTimer = null
  }
  if (resumeReconnectTimer) {
    clearTimeout(resumeReconnectTimer)
    resumeReconnectTimer = null
  }
  saveControlWindowBounds()
  tray?.destroy()
  tray = null
  rendererServer?.close()
  rendererServer = null
  rendererServerUrl = null
  globalShortcut.unregisterAll()
  memeDropClient?.stop()
  memeDropClient = null
})
