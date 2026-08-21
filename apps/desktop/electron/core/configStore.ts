import {
  getAppConfigPath,
  readAppConfigFile,
  writeAppConfigFile,
  type ControlWindowBounds,
} from './appConfig.ts'
import { DEFAULT_CONTROL_PANEL_SECTION_STATE } from '../../shared/types.ts'
import type {
  AppPreferences,
  ControlPanelSectionId,
  ControlPanelSectionState,
  DiscordUser,
  OverlayDisplayPreferences,
  ServerConnectionConfig,
  ServerConfig,
  ShortcutActionId,
  ShortcutConfig,
} from '../../shared/types'

const MAX_AUTH_TOKEN_LENGTH = 4096
const MAX_AUTH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const AUTH_CLOCK_SKEW_MS = 60 * 1000
const AUTH_TOKEN_PATTERN = /^[A-Za-z0-9._-]+$/

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const normalizeControlPanelSectionState = (
  state: Partial<ControlPanelSectionState> | undefined,
): ControlPanelSectionState => ({
  dropReception:
    typeof state?.dropReception === 'boolean'
      ? state.dropReception
      : DEFAULT_CONTROL_PANEL_SECTION_STATE.dropReception,
  overlayAppearance:
    typeof state?.overlayAppearance === 'boolean'
      ? state.overlayAppearance
      : DEFAULT_CONTROL_PANEL_SECTION_STATE.overlayAppearance,
  accountAndServer:
    typeof state?.accountAndServer === 'boolean'
      ? state.accountAndServer
      : DEFAULT_CONTROL_PANEL_SECTION_STATE.accountAndServer,
})

const isControlPanelSectionId = (value: unknown): value is ControlPanelSectionId =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(DEFAULT_CONTROL_PANEL_SECTION_STATE, value)

const normalizeServerConfig = (config: ServerConfig): ServerConfig => ({
  serverUrl: normalizeString(config.serverUrl),
  accessKey: normalizeString(config.accessKey),
  discordUserId: normalizeString(config.discordUserId),
  discordUserName: normalizeString(config.discordUserName),
  discordUserAvatarUrl: normalizeString(config.discordUserAvatarUrl) || null,
})

const normalizeAuthToken = (value: unknown): string => {
  const token = normalizeString(value)
  return token.length <= MAX_AUTH_TOKEN_LENGTH && AUTH_TOKEN_PATTERN.test(token)
    ? token
    : ''
}

const normalizeAuthTokenExpiration = (value: unknown): string | null => {
  const expiration = normalizeString(value)
  const timestamp = Date.parse(expiration)

  return expiration && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

const hasUsableAuthentication = (config: ServerConnectionConfig): boolean =>
  (() => {
    const now = Date.now()
    const expiresAt = config.authTokenExpiresAt
      ? Date.parse(config.authTokenExpiresAt)
      : Number.NaN

    return Boolean(
      config.authToken &&
        config.discordUserId &&
        expiresAt > now &&
        expiresAt <= now + MAX_AUTH_TOKEN_TTL_MS + AUTH_CLOCK_SKEW_MS,
    )
  })()

const withoutAuthentication = (
  config: Pick<ServerConnectionConfig, 'serverUrl' | 'accessKey'>,
): ServerConnectionConfig => ({
  serverUrl: config.serverUrl,
  accessKey: config.accessKey,
  discordUserId: '',
  discordUserName: '',
  discordUserAvatarUrl: null,
  authToken: '',
  authTokenExpiresAt: null,
})

const toPublicServerConfig = (config: ServerConnectionConfig): ServerConfig => ({
  serverUrl: config.serverUrl,
  accessKey: config.accessKey,
  discordUserId: config.discordUserId,
  discordUserName: config.discordUserName,
  discordUserAvatarUrl: config.discordUserAvatarUrl,
})

export const createConfigStore = (userDataPath: string) => {
  const configPath = getAppConfigPath(userDataPath)
  const readConfig = () => readAppConfigFile(configPath)
  const writeConfig = (config: ReturnType<typeof readConfig>) => {
    writeAppConfigFile(configPath, config)
  }

  const getServerConnectionConfig = (): ServerConnectionConfig => {
    const stored = readConfig().server ?? {}
    const normalized: ServerConnectionConfig = {
      serverUrl: normalizeString(stored.serverUrl ?? process.env.MEMEDROP_SERVER_URL),
      accessKey: normalizeString(stored.accessKey ?? process.env.MEMEDROP_SERVER_KEY),
      discordUserId: normalizeString(stored.discordUserId),
      discordUserName: normalizeString(stored.discordUserName),
      discordUserAvatarUrl: normalizeString(stored.discordUserAvatarUrl) || null,
      authToken: normalizeAuthToken(stored.authToken),
      authTokenExpiresAt: normalizeAuthTokenExpiration(stored.authTokenExpiresAt),
    }

    return hasUsableAuthentication(normalized)
      ? normalized
      : withoutAuthentication(normalized)
  }

  const getServerConfig = (): ServerConfig =>
    toPublicServerConfig(getServerConnectionConfig())

  const writeServerConnectionConfig = (server: ServerConnectionConfig) => {
    writeConfig({
      ...readConfig(),
      server,
    })
  }

  const saveServerConfig = (config: ServerConfig): ServerConfig => {
    const normalized = normalizeServerConfig(config)
    const current = getServerConnectionConfig()
    const sameServer =
      normalized.serverUrl === current.serverUrl && normalized.accessKey === current.accessKey
    const nextConfig = sameServer
      ? {
          ...current,
          serverUrl: normalized.serverUrl,
          accessKey: normalized.accessKey,
        }
      : withoutAuthentication(normalized)

    writeServerConnectionConfig(nextConfig)
    return toPublicServerConfig(nextConfig)
  }

  const saveDiscordAuthentication = (
    expectedServer: Pick<ServerConfig, 'serverUrl' | 'accessKey'>,
    user: DiscordUser,
    authToken: string,
    authTokenExpiresAt: string,
  ): ServerConfig => {
    const current = getServerConnectionConfig()
    const expectedServerUrl = normalizeString(expectedServer.serverUrl)
    const expectedAccessKey = normalizeString(expectedServer.accessKey)

    if (current.serverUrl !== expectedServerUrl || current.accessKey !== expectedAccessKey) {
      throw new Error('La configuration du serveur a changé pendant la connexion Discord.')
    }

    const normalizedToken = normalizeAuthToken(authToken)
    const normalizedExpiration = normalizeAuthTokenExpiration(authTokenExpiresAt)
    const discordUserId = normalizeString(user.id)
    const now = Date.now()
    const expirationTimestamp = normalizedExpiration
      ? Date.parse(normalizedExpiration)
      : Number.NaN

    if (
      !normalizedToken ||
      !normalizedExpiration ||
      !discordUserId ||
      expirationTimestamp <= now ||
      expirationTimestamp > now + MAX_AUTH_TOKEN_TTL_MS + AUTH_CLOCK_SKEW_MS
    ) {
      throw new Error("Le serveur a renvoyé une authentification Discord invalide.")
    }

    const nextConfig: ServerConnectionConfig = {
      ...current,
      discordUserId,
      discordUserName: normalizeString(user.username) || discordUserId,
      discordUserAvatarUrl: normalizeString(user.avatarUrl) || null,
      authToken: normalizedToken,
      authTokenExpiresAt: normalizedExpiration,
    }

    writeServerConnectionConfig(nextConfig)
    return toPublicServerConfig(nextConfig)
  }

  const clearDiscordAuthentication = (): ServerConfig => {
    const nextConfig = withoutAuthentication(getServerConnectionConfig())
    writeServerConnectionConfig(nextConfig)
    return toPublicServerConfig(nextConfig)
  }

  const getHideOwnDrops = () => Boolean(readConfig().overlay?.hideOwnDrops)

  const saveHideOwnDrops = (hideOwnDrops: boolean) => {
    const stored = readConfig()
    writeConfig({
      ...stored,
      overlay: {
        ...stored.overlay,
        hideOwnDrops,
      },
    })
  }

  const getOverlayDisplayPreferences = (): OverlayDisplayPreferences => {
    const stored = readConfig().overlay ?? {}

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
    const stored = readConfig()
    writeConfig({
      ...stored,
      overlay: {
        ...stored.overlay,
        displayId: preferences.displayId,
        position: preferences.position,
        volume: preferences.volume,
        size: preferences.size,
        customX: preferences.customX,
        customY: preferences.customY,
        customAnchor: preferences.customAnchor,
      },
    })

    return getOverlayDisplayPreferences()
  }

  const getAppPreferences = (): AppPreferences => {
    const stored = readConfig().app ?? {}

    return {
      minimizeToTray: Boolean(stored.minimizeToTray),
      openAtLogin: Boolean(stored.openAtLogin),
    }
  }

  const saveAppPreferences = (preferences: AppPreferences) => {
    writeConfig({
      ...readConfig(),
      app: preferences,
    })
  }

  const getControlPanelSectionState = (): ControlPanelSectionState =>
    normalizeControlPanelSectionState(readConfig().controlPanel)

  const setControlPanelSectionOpen = (
    sectionId: ControlPanelSectionId,
    open: boolean,
  ): ControlPanelSectionState => {
    if (!isControlPanelSectionId(sectionId) || typeof open !== 'boolean') {
      throw new Error("État de section du panneau de contrôle invalide.")
    }

    const stored = readConfig()
    const state = {
      ...normalizeControlPanelSectionState(stored.controlPanel),
      [sectionId]: open,
    }

    writeConfig({
      ...stored,
      controlPanel: state,
    })

    return state
  }

  const getShortcutConfigMap = () => readConfig().shortcuts

  const saveShortcutConfigs = (shortcuts: ShortcutConfig[]) => {
    writeConfig({
      ...readConfig(),
      shortcuts: Object.fromEntries(
        shortcuts.map((shortcut) => [shortcut.action, shortcut.accelerator]),
      ) as Partial<Record<ShortcutActionId, string>>,
    })
  }

  const getControlWindowBounds = () => readConfig().controlWindow ?? {}

  const saveControlWindowBounds = (bounds: ControlWindowBounds) => {
    writeConfig({
      ...readConfig(),
      controlWindow: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
    })
  }

  return {
    getServerConfig,
    getServerConnectionConfig,
    saveServerConfig,
    saveDiscordAuthentication,
    clearDiscordAuthentication,
    getHideOwnDrops,
    saveHideOwnDrops,
    getOverlayDisplayPreferences,
    saveOverlayDisplayPreferences,
    getAppPreferences,
    saveAppPreferences,
    getControlPanelSectionState,
    setControlPanelSectionOpen,
    getShortcutConfigMap,
    saveShortcutConfigs,
    getControlWindowBounds,
    saveControlWindowBounds,
  }
}
