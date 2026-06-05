import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  AppPreferences,
  OverlayDisplayPreferences,
  OverlayState,
  ServerConfig,
  ShortcutActionId,
} from '../../shared/types'

export type ControlWindowBounds = {
  x?: number
  y?: number
  width: number
  height: number
}

export type AppConfigFile = {
  discord?: Record<string, unknown>
  server?: Partial<ServerConfig>
  overlay?: Partial<Pick<OverlayState, 'hideOwnDrops'> & OverlayDisplayPreferences>
  app?: Partial<AppPreferences>
  shortcuts?: Partial<Record<ShortcutActionId, string>>
  controlWindow?: Partial<ControlWindowBounds>
}

export const getAppConfigPath = (userDataPath: string) => path.join(userDataPath, 'config.json')

export const readAppConfigFile = (configPath: string): AppConfigFile => {
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

export const writeAppConfigFile = (configPath: string, config: AppConfigFile) => {
  mkdirSync(path.dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
}
