import { computed, ref } from 'vue'
import { DEFAULT_CONTROL_PANEL_SECTION_STATE } from '../../shared/types'
import type {
  AppPreferences,
  AppUpdateState,
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  ControlPanelSectionState,
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
  const controlPanelSectionState = ref<ControlPanelSectionState>({
    ...DEFAULT_CONTROL_PANEL_SECTION_STATE,
  })
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
  const appUpdateState = ref<AppUpdateState>({
    status: 'idle',
    currentVersion: '',
    availableVersion: null,
    downloadProgress: null,
    errorMessage: null,
    canCheck: false,
    canDownload: false,
    canInstall: false,
  })
  const serverConfig = ref<ServerConfig>({
    serverUrl: '',
    accessKey: '',
    discordUserId: '',
    discordUserName: '',
    discordUserAvatarUrl: null,
  })

  const otherConnectedUsers = computed(() =>
    connectedUsers.value.filter((user) => user.id !== serverConfig.value.discordUserId),
  )

  const applyOverlayState = (state: OverlayState) => {
    dropsEnabled.value = state.dropsEnabled
    hideOwnDrops.value = state.hideOwnDrops
  }

  return {
    controlTab,
    dropsEnabled,
    hideOwnDrops,
    isPreferencesOpen,
    connectedUsers,
    shortcutConfigs,
    shortcutStatuses,
    connectionStatus,
    controlPanelSectionState,
    appPreferences,
    appVersionInfo,
    appUpdateState,
    serverConfig,
    otherConnectedUsers,
    applyOverlayState,
  }
}
