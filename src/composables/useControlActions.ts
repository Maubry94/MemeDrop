import { ref, type Ref } from 'vue'
import type {
  AppPreferences,
  OverlayState,
  ServerConfig,
  ShortcutConfig,
  ShortcutStatus,
} from '../../shared/types'

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
  const isSavingConfig = ref(false)
  const discordAuthMessage = ref<string | null>(null)
  const isAuthenticatingDiscord = ref(false)

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

  const saveServerConfig = async () => {
    if (!window.memedrop) {
      return
    }

    isSavingConfig.value = true
    configSavedMessage.value = null

    try {
      serverConfig.value = await window.memedrop.saveServerConfig({ ...serverConfig.value })
      configSavedMessage.value = 'Configuration enregistrée.'
    } catch (error) {
      console.error('Enregistrement serveur impossible:', error)
      configSavedMessage.value = 'Enregistrement impossible.'
    } finally {
      isSavingConfig.value = false
    }
  }

  const authenticateDiscord = async () => {
    if (!window.memedrop) {
      return
    }

    isAuthenticatingDiscord.value = true
    discordAuthMessage.value = 'Connexion Discord en cours...'

    try {
      serverConfig.value = await window.memedrop.saveServerConfig({ ...serverConfig.value })
      serverConfig.value = await window.memedrop.authenticateDiscord()
      discordAuthMessage.value = `Connecté avec Discord: ${serverConfig.value.discordUserName}`
    } catch (error) {
      console.error('Connexion Discord impossible:', error)
      discordAuthMessage.value =
        error instanceof Error
          ? `Connexion Discord impossible: ${error.message}`
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
    isSavingConfig,
    discordAuthMessage,
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
