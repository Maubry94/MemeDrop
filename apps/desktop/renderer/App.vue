<script setup lang="ts">
import { computed, watch } from 'vue'
import ControlApp from './components/ControlApp.vue'
import OverlayApp from './components/OverlayApp.vue'
import { useActiveDrop } from './composables/useActiveDrop'
import { useControlActions } from './composables/useControlActions'
import { useControlState } from './composables/useControlState'
import { useMemedropBridge } from './composables/useMemedropBridge'
import { useOverlayPreferences } from './composables/useOverlayPreferences'
import type { ControlPanelSectionId } from '../shared/types'

type AppView = 'overlay' | 'control'

const viewParam = new URLSearchParams(window.location.search).get('view')
const view: AppView = viewParam === 'control' ? 'control' : 'overlay'
const isOverlayView = computed(() => view === 'overlay')

const {
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
  hasServerDrop,
  canSkipCurrentDrop,
  isTestDropActive,
  canTriggerTestDrop,
  isCurrentServerDropOwner,
  canStopGlobalDrop,
  pendingDropAction,
  dropActionError,
  completeActiveDrop,
  receiveDrop,
  clearServerDrop,
  clearTestDrop,
  skipCurrentDrop,
  retryServerDropCompletion,
  markServerDropNotPresented,
  stopCurrentDropForEveryone,
  triggerTestDrop,
} = useActiveDrop({
  isOverlayView,
  dropsEnabled: computed(() => dropsEnabled.value),
  hideOwnDrops: computed(() => hideOwnDrops.value),
  serverConfig: computed(() => serverConfig.value),
})

const {
  initializationStatus,
  initializationError,
  requestInitialState,
} = useMemedropBridge({
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
  setControlPanelSectionState: (state) => {
    controlPanelSectionState.value = state
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
  retryServerDropCompletion,
  markServerDropNotPresented,
})

const {
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
} = useControlActions({
  appPreferences,
  serverConfig,
  shortcutConfigs,
  shortcutStatuses,
  applyOverlayState,
})

const updateControlPanelSection = async (
  section: ControlPanelSectionId,
  open: boolean,
) => {
  if (controlPanelSectionState.value[section] === open) {
    return
  }

  const previousOpen = controlPanelSectionState.value[section]
  controlPanelSectionState.value = {
    ...controlPanelSectionState.value,
    [section]: open,
  }

  try {
    await window.memedrop?.setControlPanelSectionOpen(section, open)
  } catch (error) {
    if (controlPanelSectionState.value[section] === open) {
      controlPanelSectionState.value = {
        ...controlPanelSectionState.value,
        [section]: previousOpen,
      }
    }
    console.error(`Enregistrement de la section « ${section} » impossible :`, error)
  }
}

watch(
  () => [
    serverConfig.value.discordUserId,
    connectionStatus.value?.reason,
  ] as const,
  ([discordUserId, connectionReason]) => {
    if (!discordUserId && !isAuthenticatingDiscord.value) {
      const sessionExpired = connectionReason === 'session-expired'
      if (sessionExpired) {
        discordAuthStatus.value = 'error'
        discordAuthMessage.value = 'Session Discord expirée. Reconnecte-toi pour continuer.'
      } else if (discordAuthStatus.value !== 'error') {
        discordAuthStatus.value = 'idle'
        discordAuthMessage.value = null
      }
    }
  },
  { immediate: true },
)

watch(dropsEnabled, (value) => {
  if (!value && isOverlayView.value) {
    void completeActiveDrop()
  }
})
</script>

<template>
  <div class="h-full w-full overflow-hidden">
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
      :keep-test-image-visible="isTestDropActive"
      @advance="completeActiveDrop"
    />

    <ControlApp
      v-else
      v-model:server-config="serverConfig"
      :app-preferences="appPreferences"
      :app-version-info="appVersionInfo"
      :app-update-state="appUpdateState"
      :auth-message="discordAuthMessage"
      :auth-status="discordAuthStatus"
      :can-skip-current-drop="canSkipCurrentDrop"
      :can-stop-global-drop="canStopGlobalDrop"
      :can-trigger-test-drop="canTriggerTestDrop"
      :config-saved-message="configSavedMessage"
      :config-save-status="configSaveStatus"
      :connection-status="connectionStatus"
      :control-panel-section-state="controlPanelSectionState"
      :control-tab="controlTab"
      :custom-anchor="customAnchor"
      :custom-x="customX"
      :custom-y="customY"
      :drop-size="dropSize"
      :drop-volume="dropVolume"
      :drops-enabled="dropsEnabled"
      :drop-action-error="dropActionError"
      :has-server-drop="hasServerDrop"
      :hide-own-drops="hideOwnDrops"
      :is-authenticating-discord="isAuthenticatingDiscord"
      :is-preferences-open="isPreferencesOpen"
      :is-saving-config="isSavingConfig"
      :is-current-server-drop-owner="isCurrentServerDropOwner"
      :is-test-drop-active="isTestDropActive"
      :initialization-status="initializationStatus"
      :initialization-error="initializationError"
      :other-connected-users="otherConnectedUsers"
      :overlay-display-id="overlayDisplayId"
      :overlay-displays="overlayDisplays"
      :overlay-position="overlayPosition"
      :pending-drop-action="pendingDropAction"
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
      @retry-initialization="requestInitialState"
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
      @update-control-panel-section="updateControlPanelSection"
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
