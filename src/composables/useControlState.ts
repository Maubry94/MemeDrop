import { computed, ref } from 'vue'
import type {
  AppPreferences,
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  OverlayState,
  ServerConfig,
  ShortcutConfig,
  ShortcutStatus,
} from '../../shared/types'

export type ControlTab = 'control' | 'connected'

export const useControlState = () => {
  const controlTab = ref<ControlTab>('control')
  const dropsEnabled = ref(true)
  const hideOwnDrops = ref(false)
  const isPreferencesOpen = ref(false)
  const connectedUsers = ref<ConnectedUser[]>([])
  const shortcutConfigs = ref<ShortcutConfig[]>([])
  const shortcutStatuses = ref<ShortcutStatus[]>([])
  const connectionStatus = ref<ConnectionStatus | null>(null)
  const appPreferences = ref<AppPreferences>({
    minimizeToTray: false,
    openAtLogin: false,
  })
  const appVersionInfo = ref<AppVersionInfo>({
    currentVersion: '',
    latestVersion: '',
    updateAvailable: false,
    releaseUrl: '',
  })
  const serverConfig = ref<ServerConfig>({
    serverUrl: '',
    accessKey: '',
    discordUserId: '',
    discordUserName: '',
    discordUserAvatarUrl: null,
  })

  let syncingOverlayState = false

  const isDiscordConnected = computed(() => Boolean(serverConfig.value.discordUserId))
  const otherConnectedUsers = computed(() =>
    connectedUsers.value.filter((user) => user.id !== serverConfig.value.discordUserId),
  )

  const applyOverlayState = (state: OverlayState) => {
    syncingOverlayState = true
    dropsEnabled.value = state.dropsEnabled
    hideOwnDrops.value = state.hideOwnDrops
    syncingOverlayState = false
  }

  const isSyncingOverlayState = () => syncingOverlayState

  return {
    controlTab,
    dropsEnabled,
    hideOwnDrops,
    isPreferencesOpen,
    connectedUsers,
    shortcutConfigs,
    shortcutStatuses,
    connectionStatus,
    appPreferences,
    appVersionInfo,
    serverConfig,
    isDiscordConnected,
    otherConnectedUsers,
    applyOverlayState,
    isSyncingOverlayState,
  }
}
