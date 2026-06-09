<script setup lang="ts">
import ConnectedUsersView from './control/ConnectedUsersView.vue'
import ControlPanel from './control/ControlPanel.vue'
import LoginView from './control/LoginView.vue'
import PreferencesModal from './control/PreferencesModal.vue'
import Button from './ui/Button.vue'
import type {
  AppPreferences,
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

defineProps<{
  appPreferences: AppPreferences
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

defineEmits<{
  authenticate: []
  closePreferences: []
  disconnectDiscord: []
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
      v-if="isDiscordConnected && appVersionInfo.updateAvailable"
      class="rounded-lg border border-amber-300/25 bg-amber-400/10 p-3 text-xs text-amber-100"
    >
      <p class="font-semibold">Une nouvelle version de MemeDrop est disponible.</p>
      <p class="mt-1 text-amber-100/80">
        Vous utilisez la version {{ appVersionInfo.currentVersion }}. Téléchargez la version
        {{ appVersionInfo.latestVersion }} depuis GitHub.
      </p>
      <Button
        class="mt-3"
        variant="warning"
        size="xs"
        @click="$emit('openReleasePage')"
      >
        Télécharger la dernière version
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
