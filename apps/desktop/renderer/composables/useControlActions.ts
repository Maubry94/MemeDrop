import { ref, watch, type Ref } from 'vue'
import type {
  AppPreferences,
  OverlayState,
  ServerConfig,
  ShortcutConfig,
  ShortcutStatus,
} from '../../shared/types'

export type ActionFeedbackStatus = 'idle' | 'success' | 'error'

type ControlActionsOptions = {
  appPreferences: Ref<AppPreferences>
  serverConfig: Ref<ServerConfig>
  shortcutConfigs: Ref<ShortcutConfig[]>
  shortcutStatuses: Ref<ShortcutStatus[]>
  applyOverlayState: (state: OverlayState) => void
}

export const useControlActions = ({
  appPreferences,
  serverConfig,
  shortcutConfigs,
  shortcutStatuses,
  applyOverlayState,
}: ControlActionsOptions) => {
  const configSavedMessage = ref<string | null>(null)
  const configSaveStatus = ref<ActionFeedbackStatus>('idle')
  const isSavingConfig = ref(false)
  const discordAuthMessage = ref<string | null>(null)
  const discordAuthStatus = ref<ActionFeedbackStatus>('idle')
  const isAuthenticatingDiscord = ref(false)
  let lastSavedServerFingerprint = `${serverConfig.value.serverUrl}\u0000${serverConfig.value.accessKey}`

  watch(
    () => [serverConfig.value.serverUrl, serverConfig.value.accessKey] as const,
    ([serverUrl, accessKey]) => {
      const fingerprint = `${serverUrl}\u0000${accessKey}`
      if (
        configSaveStatus.value === 'error' ||
        (configSaveStatus.value === 'success' && fingerprint !== lastSavedServerFingerprint)
      ) {
        configSaveStatus.value = 'idle'
        configSavedMessage.value = null
      }
    },
  )

  const updateAppPreferences = async (preferences: AppPreferences) => {
    if (!window.memedrop) {
      return
    }

    appPreferences.value = await window.memedrop.setAppPreferences(preferences)
  }

  const updateShortcutConfigs = async (shortcuts: ShortcutConfig[]) => {
    if (!window.memedrop) {
      return
    }
    shortcutConfigs.value = await window.memedrop.setShortcutConfigs(shortcuts)
    shortcutStatuses.value = await window.memedrop.getShortcutStatus()
  }

  const startShortcutCapture = async (action: ShortcutConfig['action']) => {
    if (!window.memedrop) {
      return
    }
    shortcutConfigs.value = await window.memedrop.startShortcutCapture(action)
  }

  const resetShortcutConfigs = async () => {
    if (!window.memedrop) {
      return
    }
    shortcutConfigs.value = await window.memedrop.resetShortcutConfigs()
    shortcutStatuses.value = await window.memedrop.getShortcutStatus()
  }

  const uninstallApp = async () => {
    const confirmed = window.confirm(
      'Désinstaller MemeDrop ? L’application va lancer le programme de désinstallation Windows.',
    )

    if (!confirmed) {
      return
    }

    try {
      await window.memedrop?.uninstallApp()
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "La désinstallation n'a pas pu être lancée.",
      )
    }
  }

  const quitApp = async () => {
    await window.memedrop?.quitApp()
  }

  const openReleasePage = async () => {
    await window.memedrop?.openReleasePage()
  }

  const checkForAppUpdate = async () => {
    await window.memedrop?.checkForAppUpdate()
  }

  const downloadAppUpdate = async () => {
    await window.memedrop?.downloadAppUpdate()
  }

  const installAppUpdate = async () => {
    await window.memedrop?.installAppUpdate()
  }

  const saveServerConfig = async (): Promise<boolean> => {
    if (isSavingConfig.value) {
      return false
    }

    if (!window.memedrop) {
      configSaveStatus.value = 'error'
      configSavedMessage.value = "L'application ne peut pas enregistrer la configuration."
      return false
    }

    isSavingConfig.value = true
    configSaveStatus.value = 'idle'
    configSavedMessage.value = null

    try {
      serverConfig.value = await window.memedrop.saveServerConfig({ ...serverConfig.value })
      lastSavedServerFingerprint = `${serverConfig.value.serverUrl}\u0000${serverConfig.value.accessKey}`
      configSaveStatus.value = 'success'
      configSavedMessage.value = 'Configuration enregistrée.'
      discordAuthStatus.value = 'idle'
      discordAuthMessage.value = null
      return true
    } catch (error) {
      console.error('Enregistrement serveur impossible:', error)
      configSaveStatus.value = 'error'
      configSavedMessage.value = 'Enregistrement impossible.'
      return false
    } finally {
      isSavingConfig.value = false
    }
  }

  const authenticateDiscord = async () => {
    if (isAuthenticatingDiscord.value) {
      return
    }

    if (!window.memedrop) {
      return
    }

    isAuthenticatingDiscord.value = true
    discordAuthStatus.value = 'idle'
    discordAuthMessage.value = 'Connexion Discord en cours…'

    try {
      serverConfig.value = await window.memedrop.saveServerConfig({ ...serverConfig.value })
      serverConfig.value = await window.memedrop.authenticateDiscord()
      discordAuthStatus.value = 'success'
      discordAuthMessage.value = null
    } catch (error) {
      console.error('Connexion Discord impossible:', error)
      discordAuthStatus.value = 'error'
      discordAuthMessage.value =
        error instanceof Error
          ? `Connexion Discord impossible : ${error.message}`
          : 'Connexion Discord impossible.'
    } finally {
      isAuthenticatingDiscord.value = false
    }
  }

  const disconnectDiscord = async () => {
    if (!window.memedrop) {
      return
    }

    serverConfig.value = await window.memedrop.disconnectDiscord()
    discordAuthStatus.value = 'idle'
    discordAuthMessage.value = null
  }

  const toggleDrops = async () => {
    const state = await window.memedrop?.toggleDrops()
    if (state) {
      applyOverlayState(state)
    }
  }

  const toggleHideOwnDrops = async () => {
    const state = await window.memedrop?.toggleHideOwnDrops()
    if (state) {
      applyOverlayState(state)
    }
  }

  return {
    configSavedMessage,
    configSaveStatus,
    isSavingConfig,
    discordAuthMessage,
    discordAuthStatus,
    isAuthenticatingDiscord,
    updateAppPreferences,
    updateShortcutConfigs,
    startShortcutCapture,
    resetShortcutConfigs,
    uninstallApp,
    quitApp,
    openReleasePage,
    checkForAppUpdate,
    downloadAppUpdate,
    installAppUpdate,
    saveServerConfig,
    authenticateDiscord,
    disconnectDiscord,
    toggleDrops,
    toggleHideOwnDrops,
  }
}
