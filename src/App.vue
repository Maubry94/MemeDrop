<script setup lang="ts">
import { computed, watch } from 'vue'
import ControlApp from './components/ControlApp.vue'
import OverlayApp from './components/OverlayApp.vue'
import { useActiveDrop } from './composables/useActiveDrop'
import { useControlActions } from './composables/useControlActions'
import { useControlState } from './composables/useControlState'
import { useMemedropBridge } from './composables/useMemedropBridge'
import { useOverlayPreferences } from './composables/useOverlayPreferences'

type AppView = 'overlay' | 'control'

const viewParam = new URLSearchParams(window.location.search).get('view')
const view: AppView = viewParam === 'control' ? 'control' : 'overlay'
const isOverlayView = computed(() => view === 'overlay')
const isControlView = computed(() => view === 'control')

const {
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
  appUpdateState,
  serverConfig,
  isDiscordConnected,
  otherConnectedUsers,
  applyOverlayState,
  isSyncingOverlayState,
} = useControlState()

const {
  overlayPosition,
  overlayDisplayId,
  overlayDisplays,
  dropVolume,
  dropSize,
  customX,
  customY,
  customAnchor,
  overlayClasses,
  overlayCustomStyle,
  applyOverlayDisplayPreferences,
} = useOverlayPreferences()

const {
  activeDrop,
  activeKind,
  hasDrop,
  isTestDropActive,
  canStopGlobalDrop,
  completeActiveDrop,
  receiveDrop,
  clearServerDrop,
  clearTestDrop,
  skipCurrentDrop,
  completeLocalDrop,
  stopCurrentDropForEveryone,
  triggerTestDrop,
} = useActiveDrop({
  isOverlayView,
  dropsEnabled: computed(() => dropsEnabled.value),
  serverConfig: computed(() => serverConfig.value),
})

useMemedropBridge({
  isOverlayView,
  applyOverlayState,
  applyOverlayDisplayPreferences,
  setOverlayDisplays: (displays) => {
    overlayDisplays.value = displays
  },
  setAppPreferences: (preferences) => {
    appPreferences.value = preferences
  },
  setAppVersionInfo: (info) => {
    appVersionInfo.value = info
  },
  setAppUpdateState: (state) => {
    appUpdateState.value = state
  },
  setConnectionStatus: (status) => {
    connectionStatus.value = status
  },
  setConnectedUsers: (users) => {
    connectedUsers.value = users
  },
  setShortcutConfigs: (shortcuts) => {
    shortcutConfigs.value = shortcuts
  },
  setShortcutStatus: (status) => {
    shortcutStatuses.value = status
  },
  setServerConfig: (config) => {
    serverConfig.value = config
  },
  receiveDrop,
  clearServerDrop,
  clearTestDrop,
  completeLocalDrop,
})

const {
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
} = useControlActions({
  appPreferences,
  serverConfig,
  shortcutConfigs,
  shortcutStatuses,
  applyOverlayState,
})

watch(
  () => serverConfig.value.discordUserId,
  (discordUserId) => {
    if (!discordUserId && !isAuthenticatingDiscord.value) {
      discordAuthMessage.value = connectionStatus.value?.message.includes(
        'session Discord expirée',
      )
        ? 'Session Discord expirée. Reconnecte-toi pour continuer.'
        : null
    }
  },
)

watch(dropsEnabled, async (value) => {
  if (!value) {
    void completeActiveDrop()
  }

  if (isSyncingOverlayState() || !isControlView.value) {
    return
  }
  await window.memedrop?.setDropsEnabled(value)
})
</script>

<template>
  <div class="h-full w-full">
    <OverlayApp
      v-if="isOverlayView"
      :active-drop="activeDrop"
      :active-kind="activeKind"
      :has-drop="hasDrop"
      :overlay-classes="overlayClasses"
      :overlay-custom-style="overlayCustomStyle"
      :drop-volume="dropVolume"
      :drop-size="dropSize"
      :is-custom-position="overlayPosition === 'custom'"
      @advance="completeActiveDrop"
    />

    <ControlApp
      v-else
      v-model:server-config="serverConfig"
      :app-preferences="appPreferences"
      :app-version-info="appVersionInfo"
      :app-update-state="appUpdateState"
      :auth-message="discordAuthMessage"
      :can-stop-global-drop="canStopGlobalDrop"
      :config-saved-message="configSavedMessage"
      :connection-status="connectionStatus"
      :control-tab="controlTab"
      :custom-anchor="customAnchor"
      :custom-x="customX"
      :custom-y="customY"
      :drop-size="dropSize"
      :drop-volume="dropVolume"
      :drops-enabled="dropsEnabled"
      :hide-own-drops="hideOwnDrops"
      :is-authenticating-discord="isAuthenticatingDiscord"
      :is-discord-connected="isDiscordConnected"
      :is-preferences-open="isPreferencesOpen"
      :is-saving-config="isSavingConfig"
      :is-test-drop-active="isTestDropActive"
      :other-connected-users="otherConnectedUsers"
      :overlay-display-id="overlayDisplayId"
      :overlay-displays="overlayDisplays"
      :overlay-position="overlayPosition"
      :shortcut-configs="shortcutConfigs"
      :shortcut-statuses="shortcutStatuses"
      @authenticate="authenticateDiscord"
      @close-preferences="isPreferencesOpen = false"
      @disconnect-discord="disconnectDiscord"
      @open-preferences="isPreferencesOpen = true"
      @open-release-page="openReleasePage"
      @check-for-app-update="checkForAppUpdate"
      @download-app-update="downloadAppUpdate"
      @install-app-update="installAppUpdate"
      @quit-app="quitApp"
      @reset-shortcuts="resetShortcutConfigs"
      @save-server-config="saveServerConfig"
      @skip-current-drop="skipCurrentDrop"
      @start-shortcut-capture="startShortcutCapture"
      @stop-current-drop-for-everyone="stopCurrentDropForEveryone"
      @toggle-drops="toggleDrops"
      @toggle-hide-own-drops="toggleHideOwnDrops"
      @trigger-test-drop="triggerTestDrop"
      @uninstall-app="uninstallApp"
      @update-app-preferences="updateAppPreferences"
      @update-control-tab="controlTab = $event"
      @update-custom-anchor="customAnchor = $event"
      @update-custom-x="customX = $event"
      @update-custom-y="customY = $event"
      @update-drop-size="dropSize = $event"
      @update-drop-volume="dropVolume = $event"
      @update-overlay-display-id="overlayDisplayId = $event"
      @update-overlay-position="overlayPosition = $event"
      @update-shortcuts="updateShortcutConfigs"
    />
  </div>
</template>
