<script setup lang="ts">
import { computed } from 'vue'
import ConnectedUsersView from './control/ConnectedUsersView.vue'
import ControlPanel from './control/ControlPanel.vue'
import LoginView from './control/LoginView.vue'
import PreferencesModal from './control/PreferencesModal.vue'
import Button from './ui/Button.vue'
import type {
  AppPreferences,
  AppUpdateState,
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  OverlayAnchor,
  OverlayDisplayInfo,
  OverlayPosition,
  ServerConfig,
  ShortcutConfig,
  ShortcutStatus,
} from '../../shared/types'
import type { ControlTab } from '../composables/useControlState'

const props = defineProps<{
  appPreferences: AppPreferences
  appUpdateState: AppUpdateState
  appVersionInfo: AppVersionInfo
  authMessage: string | null
  canStopGlobalDrop: boolean
  configSavedMessage: string | null
  connectionStatus: ConnectionStatus | null
  controlTab: ControlTab
  customAnchor: OverlayAnchor
  customX: number
  customY: number
  dropSize: number
  dropVolume: number
  dropsEnabled: boolean
  hideOwnDrops: boolean
  isAuthenticatingDiscord: boolean
  isDiscordConnected: boolean
  isPreferencesOpen: boolean
  isSavingConfig: boolean
  isTestDropActive: boolean
  otherConnectedUsers: ConnectedUser[]
  overlayDisplayId: string
  overlayDisplays: OverlayDisplayInfo[]
  overlayPosition: OverlayPosition
  shortcutConfigs: ShortcutConfig[]
  shortcutStatuses: ShortcutStatus[]
}>()

const serverConfig = defineModel<ServerConfig>('serverConfig', { required: true })

const emit = defineEmits<{
  authenticate: []
  checkForAppUpdate: []
  closePreferences: []
  disconnectDiscord: []
  downloadAppUpdate: []
  installAppUpdate: []
  openPreferences: []
  openReleasePage: []
  quitApp: []
  resetShortcuts: []
  saveServerConfig: []
  skipCurrentDrop: []
  startShortcutCapture: [action: ShortcutConfig['action']]
  stopCurrentDropForEveryone: []
  toggleDrops: []
  toggleHideOwnDrops: []
  triggerTestDrop: []
  uninstallApp: []
  updateAppPreferences: [preferences: AppPreferences]
  updateControlTab: [tab: ControlTab]
  updateCustomAnchor: [anchor: OverlayAnchor]
  updateCustomX: [value: number]
  updateCustomY: [value: number]
  updateDropSize: [value: number]
  updateDropVolume: [value: number]
  updateOverlayDisplayId: [displayId: string]
  updateOverlayPosition: [position: OverlayPosition]
  updateShortcuts: [shortcuts: ShortcutConfig[]]
}>()

const activeUpdateVersion = computed(
  () => props.appUpdateState.availableVersion ?? props.appVersionInfo.latestVersion,
)

const showUpdateBanner = computed(
  () =>
    props.appUpdateState.status !== 'disabled' &&
    (
      props.appVersionInfo.updateAvailable ||
      props.appUpdateState.status === 'checking' ||
      props.appUpdateState.status === 'available' ||
      props.appUpdateState.status === 'downloading' ||
      props.appUpdateState.status === 'verifying' ||
      props.appUpdateState.status === 'downloaded' ||
      props.appUpdateState.status === 'error'
    ),
)

const updateMessage = computed(() => {
  if (props.appUpdateState.status === 'checking') {
    return 'Recherche de mise à jour en cours...'
  }

  if (props.appUpdateState.status === 'downloading') {
    return `Téléchargement en cours (${props.appUpdateState.downloadProgress ?? 0}%).`
  }

  if (props.appUpdateState.status === 'verifying') {
    return "Vérification cryptographique de la mise à jour en cours..."
  }

  if (props.appUpdateState.status === 'downloaded') {
    return `La version ${activeUpdateVersion.value} est prête. Redémarre MemeDrop pour l'installer.`
  }

  if (props.appUpdateState.status === 'error') {
    return props.appUpdateState.errorMessage ?? 'Mise à jour impossible pour le moment.'
  }

  if (props.appUpdateState.status === 'available') {
    return `Tu utilises la version ${props.appVersionInfo.currentVersion}. La version ${activeUpdateVersion.value} est disponible.`
  }

  if (props.appVersionInfo.updateAvailable) {
    return `Le serveur annonce la version ${activeUpdateVersion.value}. Vérifie sa signature avant de la télécharger.`
  }

  return `Tu utilises la dernière version de MemeDrop (${props.appVersionInfo.currentVersion}).`
})

const updateTitle = computed(() => {
  if (props.appUpdateState.status === 'downloaded') {
    return 'Mise à jour prête'
  }

  if (
    props.appUpdateState.status === 'checking' ||
    props.appUpdateState.status === 'downloading' ||
    props.appUpdateState.status === 'verifying'
  ) {
    return 'Mise à jour MemeDrop'
  }

  if (props.appUpdateState.status === 'error') {
    return 'Mise à jour indisponible'
  }

  return 'Une nouvelle version de MemeDrop est disponible.'
})

const updateActionLabel = computed(() => {
  if (props.appUpdateState.status === 'checking') {
    return 'Recherche...'
  }

  if (props.appUpdateState.status === 'downloading') {
    return 'Téléchargement...'
  }

  if (props.appUpdateState.status === 'verifying') {
    return 'Vérification...'
  }

  if (props.appUpdateState.status === 'downloaded') {
    return 'Redémarrer pour installer'
  }

  if (props.appUpdateState.status === 'error') {
    return 'Réessayer'
  }

  if (props.appUpdateState.status === 'available') {
    return 'Télécharger la mise à jour'
  }

  if (props.appVersionInfo.updateAvailable) {
    return 'Vérifier la mise à jour'
  }

  return 'Rechercher une mise à jour'
})

const isUpdateActionDisabled = computed(
  () => {
    if (
      props.appUpdateState.status === 'disabled' ||
      props.appUpdateState.status === 'checking' ||
      props.appUpdateState.status === 'downloading' ||
      props.appUpdateState.status === 'verifying'
    ) {
      return true
    }

    if (props.appUpdateState.status === 'downloaded') {
      return !props.appUpdateState.canInstall
    }

    if (props.appUpdateState.status === 'available') {
      return !props.appUpdateState.canDownload
    }

    return !props.appUpdateState.canCheck
  },
)

const runUpdateAction = () => {
  if (props.appUpdateState.status === 'downloaded') {
    emit('installAppUpdate')
    return
  }

  if (props.appUpdateState.status === 'available') {
    emit('downloadAppUpdate')
    return
  }

  emit('checkForAppUpdate')
}
</script>

<template>
  <div class="flex h-full w-full flex-col gap-4 overflow-y-auto bg-slate-950 p-4 text-sm text-slate-100">
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold">MemeDrop</span>
      <Button
        variant="icon"
        size="icon"
        title="Préférences"
        aria-label="Préférences"
        @click="$emit('openPreferences')"
      >
        <span
          class="size-4 bg-current"
          style="mask: url('/icons/gear.svg') center / contain no-repeat; -webkit-mask: url('/icons/gear.svg') center / contain no-repeat;"
          aria-hidden="true"
        />
      </Button>
    </div>

    <PreferencesModal
      v-if="isPreferencesOpen"
      :preferences="appPreferences"
      :shortcut-configs="shortcutConfigs"
      :shortcut-statuses="shortcutStatuses"
      @close="$emit('closePreferences')"
      @update-preferences="$emit('updateAppPreferences', $event)"
      @update-shortcuts="$emit('updateShortcuts', $event)"
      @start-shortcut-capture="$emit('startShortcutCapture', $event)"
      @reset-shortcuts="$emit('resetShortcuts')"
      @quit-app="$emit('quitApp')"
      @uninstall-app="$emit('uninstallApp')"
    />

    <LoginView
      v-if="!isDiscordConnected"
      v-model="serverConfig"
      :is-authenticating="isAuthenticatingDiscord"
      :auth-message="authMessage"
      :is-saving-config="isSavingConfig"
      :config-saved-message="configSavedMessage"
      @authenticate="$emit('authenticate')"
      @save-server-config="$emit('saveServerConfig')"
    />

    <div
      v-if="showUpdateBanner"
      class="rounded-lg border border-amber-300/25 bg-amber-400/10 p-3 text-xs text-amber-100"
    >
      <p class="font-semibold">{{ updateTitle }}</p>
      <p class="mt-1 text-amber-100/80">
        {{ updateMessage }}
      </p>
      <Button
        class="mt-3"
        variant="warning"
        size="xs"
        :disabled="isUpdateActionDisabled"
        @click="runUpdateAction"
      >
        {{ updateActionLabel }}
      </Button>
    </div>

    <div v-if="isDiscordConnected" class="grid grid-cols-2 gap-1 rounded-lg bg-slate-900/70 p-1">
      <Button
        :variant="controlTab === 'control' ? 'tabActive' : 'tab'"
        size="xs"
        @click="$emit('updateControlTab', 'control')"
      >
        Contrôle
      </Button>
      <Button
        :variant="controlTab === 'connected' ? 'tabActive' : 'tab'"
        size="xs"
        @click="$emit('updateControlTab', 'connected')"
      >
        Connecté(s) ({{ otherConnectedUsers.length }})
      </Button>
    </div>

    <ControlPanel
      v-if="isDiscordConnected && controlTab === 'control'"
      v-model:server-config="serverConfig"
      :drops-enabled="dropsEnabled"
      :hide-own-drops="hideOwnDrops"
      :can-stop-global-drop="canStopGlobalDrop"
      :drop-volume="dropVolume"
      :drop-size="dropSize"
      :is-test-drop-active="isTestDropActive"
      :overlay-position="overlayPosition"
      :overlay-display-id="overlayDisplayId"
      :overlay-displays="overlayDisplays"
      :custom-x="customX"
      :custom-y="customY"
      :custom-anchor="customAnchor"
      :is-saving-config="isSavingConfig"
      :config-saved-message="configSavedMessage"
      :auth-message="authMessage"
      :connection-status="connectionStatus"
      :shortcut-statuses="shortcutStatuses"
      @toggle-drops="$emit('toggleDrops')"
      @skip-current-drop="$emit('skipCurrentDrop')"
      @toggle-hide-own-drops="$emit('toggleHideOwnDrops')"
      @stop-current-drop-for-everyone="$emit('stopCurrentDropForEveryone')"
      @update-drop-volume="$emit('updateDropVolume', $event)"
      @update-drop-size="$emit('updateDropSize', $event)"
      @update-overlay-position="$emit('updateOverlayPosition', $event as OverlayPosition)"
      @update-overlay-display-id="$emit('updateOverlayDisplayId', $event)"
      @update-custom-x="$emit('updateCustomX', $event)"
      @update-custom-y="$emit('updateCustomY', $event)"
      @update-custom-anchor="$emit('updateCustomAnchor', $event as OverlayAnchor)"
      @save-server-config="$emit('saveServerConfig')"
      @disconnect-discord="$emit('disconnectDiscord')"
      @trigger-test-drop="$emit('triggerTestDrop')"
    />

    <ConnectedUsersView
      v-if="isDiscordConnected && controlTab === 'connected'"
      :users="otherConnectedUsers"
      empty-message="Aucun autre utilisateur connecté."
    />
  </div>
</template>
