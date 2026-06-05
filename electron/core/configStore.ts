import {
  getAppConfigPath,
  readAppConfigFile,
  writeAppConfigFile,
  type ControlWindowBounds,
} from './appConfig'
import type {
  AppPreferences,
  OverlayDisplayPreferences,
  ServerConfig,
  ShortcutActionId,
  ShortcutConfig,
} from '../../shared/types'

const normalizeServerConfig = (config: ServerConfig): ServerConfig => ({
  serverUrl: config.serverUrl.trim(),
  accessKey: config.accessKey.trim(),
  discordUserId: config.discordUserId.trim(),
  discordUserName: config.discordUserName.trim(),
  discordUserAvatarUrl: config.discordUserAvatarUrl?.trim() || null,
})

export const createConfigStore = (userDataPath: string) => {
  const configPath = getAppConfigPath(userDataPath)
  const readConfig = () => readAppConfigFile(configPath)
  const writeConfig = (config: ReturnType<typeof readConfig>) => {
    writeAppConfigFile(configPath, config)
  }

  const getServerConfig = (): ServerConfig => {
    const stored = readConfig().server ?? {}

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
      ...readConfig(),
      server: normalizeServerConfig(config),
    }

    writeConfig(nextConfig)
    return nextConfig.server
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
    saveServerConfig,
    getHideOwnDrops,
    saveHideOwnDrops,
    getOverlayDisplayPreferences,
    saveOverlayDisplayPreferences,
    getAppPreferences,
    saveAppPreferences,
    getShortcutConfigMap,
    saveShortcutConfigs,
    getControlWindowBounds,
    saveControlWindowBounds,
  }
}
