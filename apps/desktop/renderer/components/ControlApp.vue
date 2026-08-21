<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ConnectedUsersView from './control/ConnectedUsersView.vue'
import AppUpdatePanel from './control/AppUpdatePanel.vue'
import ControlInitializationView from './control/ControlInitializationView.vue'
import ControlPanel from './control/ControlPanel.vue'
import LoginView from './control/LoginView.vue'
import PreferencesModal from './control/PreferencesModal.vue'
import QuitConfirmationModal from './control/QuitConfirmationModal.vue'
import Button from './ui/Button.vue'
import type {
  AppPreferences,
  AppUpdateState,
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  ControlPanelSectionId,
  ControlPanelSectionState,
  OverlayAnchor,
  OverlayDisplayInfo,
  OverlayPosition,
  ServerConfig,
  ShortcutConfig,
  ShortcutStatus,
} from '../../shared/types'
import type { ControlTab } from '../composables/useControlState'
import type { ActionFeedbackStatus } from '../composables/useControlActions'
import type { DropAction, DropActionError } from '../composables/useActiveDrop'
import type { ControlInitializationStatus } from '../composables/useMemedropBridge'
import { getControlOnboardingStep } from '../composables/controlOnboarding'
import { getConnectionPresentation } from '../composables/connectionPresentation'

const props = defineProps<{
  appPreferences: AppPreferences
  appUpdateState: AppUpdateState
  appVersionInfo: AppVersionInfo
  authMessage: string | null
  authStatus: ActionFeedbackStatus
  canSkipCurrentDrop: boolean
  canStopGlobalDrop: boolean
  canTriggerTestDrop: boolean
  configSavedMessage: string | null
  configSaveStatus: ActionFeedbackStatus
  connectionStatus: ConnectionStatus | null
  controlPanelSectionState: ControlPanelSectionState
  controlTab: ControlTab
  customAnchor: OverlayAnchor
  customX: number
  customY: number
  dropSize: number
  dropVolume: number
  dropActionError: DropActionError | null
  dropsEnabled: boolean
  hasServerDrop: boolean
  hideOwnDrops: boolean
  isAuthenticatingDiscord: boolean
  isPreferencesOpen: boolean
  isSavingConfig: boolean
  isCurrentServerDropOwner: boolean
  isTestDropActive: boolean
  otherConnectedUsers: ConnectedUser[]
  overlayDisplayId: string
  overlayDisplays: OverlayDisplayInfo[]
  overlayPosition: OverlayPosition
  pendingDropAction: DropAction | null
  shortcutConfigs: ShortcutConfig[]
  shortcutStatuses: ShortcutStatus[]
  initializationStatus: ControlInitializationStatus
  initializationError: string | null
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
  retryInitialization: []
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
  updateControlPanelSection: [section: ControlPanelSectionId, open: boolean]
  updateCustomAnchor: [anchor: OverlayAnchor]
  updateCustomX: [value: number]
  updateCustomY: [value: number]
  updateDropSize: [value: number]
  updateDropVolume: [value: number]
  updateOverlayDisplayId: [displayId: string]
  updateOverlayPosition: [position: OverlayPosition]
  updateShortcuts: [shortcuts: ShortcutConfig[]]
}>()

const onboardingStep = computed(() =>
  getControlOnboardingStep({
    isInitialStateLoaded: props.initializationStatus === 'ready',
    serverConfig: serverConfig.value,
  }),
)
const mainElement = ref<HTMLElement | null>(null)
const isQuitConfirmationOpen = ref(false)
const isInteractionModalOpen = computed(
  () => (props.isPreferencesOpen && onboardingStep.value === 'complete')
    || isQuitConfirmationOpen.value,
)
let preferencesTriggerElement: HTMLElement | null = null
let quitTriggerElement: HTMLElement | null = null
const connectionPresentation = computed(() => getConnectionPresentation(props.connectionStatus))
const connectionBadgeClass = computed(() => ({
  success: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200',
  progress: 'border-sky-300/20 bg-sky-400/10 text-sky-200',
  warning: 'border-amber-300/20 bg-amber-400/10 text-amber-200',
  neutral: 'border-slate-600 bg-slate-800 text-slate-300',
  danger: 'border-rose-300/20 bg-rose-400/10 text-rose-200',
})[connectionPresentation.value.tone])
const relayControlPanelSection = (section: ControlPanelSectionId, open: boolean) => {
  emit('updateControlPanelSection', section, open)
}

const requestOpenPreferences = (event: MouseEvent) => {
  preferencesTriggerElement = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : null
  emit('openPreferences')
}

const requestQuitConfirmation = (event: MouseEvent) => {
  quitTriggerElement = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : null
  isQuitConfirmationOpen.value = true
}

const cancelQuit = async () => {
  isQuitConfirmationOpen.value = false
  await nextTick()
  quitTriggerElement?.focus({ preventScroll: true })
}

const confirmQuit = () => {
  isQuitConfirmationOpen.value = false
  emit('quitApp')
}

watch(onboardingStep, async (step, previousStep) => {
  if (step !== 'complete') {
    isQuitConfirmationOpen.value = false
    if (props.isPreferencesOpen) {
      emit('closePreferences')
    }
    return
  }
  if (previousStep === 'complete') {
    return
  }
  await nextTick()
  mainElement.value?.focus({ preventScroll: true })
})

watch(
  () => props.isPreferencesOpen,
  async (isOpen, wasOpen) => {
    if (!isOpen && wasOpen) {
      await nextTick()
      preferencesTriggerElement?.focus({ preventScroll: true })
    }
  },
)

</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden bg-slate-950 p-4 text-sm text-slate-100">
    <div
      class="flex items-center justify-between gap-3"
      :inert="isInteractionModalOpen"
    >
      <div class="flex min-w-0 items-center gap-2">
        <img src="/memeDrop.png" alt="" aria-hidden="true" class="size-6 shrink-0 object-contain" />
        <span class="shrink-0 text-sm font-semibold">MemeDrop</span>
        <span
          v-if="onboardingStep === 'complete'"
          class="max-w-40 truncate rounded-full border px-2 py-1 text-xs font-semibold"
          :class="connectionBadgeClass"
          :title="connectionPresentation.message"
        >
          {{ connectionPresentation.label }}
        </span>
      </div>
      <div v-if="onboardingStep === 'complete'" class="flex shrink-0 items-center gap-2">
        <Button
          variant="icon"
          size="icon"
          title="Préférences"
          aria-label="Préférences"
          @click="requestOpenPreferences"
        >
          <span
            class="size-4 bg-current"
            style="mask: url('/icons/gear.svg') center / contain no-repeat; -webkit-mask: url('/icons/gear.svg') center / contain no-repeat;"
            aria-hidden="true"
          />
        </Button>
        <span class="border-l border-white/10 pl-2">
          <Button
            variant="icon"
            size="icon"
            title="Quitter MemeDrop"
            aria-label="Quitter MemeDrop"
            @click="requestQuitConfirmation"
          >
            <span
              class="size-4 bg-current"
              style="mask: url('/icons/power.svg') center / contain no-repeat; -webkit-mask: url('/icons/power.svg') center / contain no-repeat;"
              aria-hidden="true"
            />
          </Button>
        </span>
      </div>
      <span
        v-if="onboardingStep === 'complete'"
        class="sr-only"
        :role="connectionPresentation.isError ? 'alert' : 'status'"
        :aria-live="connectionPresentation.isError ? undefined : 'polite'"
        aria-atomic="true"
      >
        État du serveur : {{ connectionPresentation.message }}
      </span>
    </div>

    <PreferencesModal
      v-if="isPreferencesOpen && onboardingStep === 'complete'"
      :preferences="appPreferences"
      :app-update-state="appUpdateState"
      :app-version-info="appVersionInfo"
      :shortcut-configs="shortcutConfigs"
      :shortcut-statuses="shortcutStatuses"
      @close="$emit('closePreferences')"
      @check-for-app-update="$emit('checkForAppUpdate')"
      @download-app-update="$emit('downloadAppUpdate')"
      @install-app-update="$emit('installAppUpdate')"
      @open-release-page="$emit('openReleasePage')"
      @update-preferences="$emit('updateAppPreferences', $event)"
      @update-shortcuts="$emit('updateShortcuts', $event)"
      @start-shortcut-capture="$emit('startShortcutCapture', $event)"
      @reset-shortcuts="$emit('resetShortcuts')"
      @uninstall-app="$emit('uninstallApp')"
    />

    <QuitConfirmationModal
      v-if="isQuitConfirmationOpen"
      @cancel="cancelQuit"
      @confirm="confirmQuit"
    />

    <main
      ref="mainElement"
      tabindex="-1"
      class="flex min-h-0 flex-1 flex-col gap-4"
      :class="[
        onboardingStep === 'complete' ? 'outline-none' : '',
        isInteractionModalOpen ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain',
      ]"
      :aria-label="onboardingStep === 'complete' ? 'Panneau MemeDrop' : 'Configuration de MemeDrop'"
      :aria-busy="initializationStatus === 'initializing'"
      :inert="isInteractionModalOpen"
    >
      <ControlInitializationView
        v-if="initializationStatus !== 'ready'"
        :status="initializationStatus"
        :error-message="initializationError"
        @retry="$emit('retryInitialization')"
      />

      <LoginView
        v-if="initializationStatus === 'ready' && onboardingStep !== 'complete'"
        v-model="serverConfig"
        :is-authenticating="isAuthenticatingDiscord"
        :auth-message="authMessage"
        :auth-status="authStatus"
        :is-saving-config="isSavingConfig"
        :config-saved-message="configSavedMessage"
        :config-save-status="configSaveStatus"
        @authenticate="$emit('authenticate')"
        @save-server-config="$emit('saveServerConfig')"
      />

      <AppUpdatePanel
        v-if="onboardingStep === 'complete' && !isPreferencesOpen"
        context="banner"
        :state="appUpdateState"
        :version-info="appVersionInfo"
        @check="$emit('checkForAppUpdate')"
        @download="$emit('downloadAppUpdate')"
        @install="$emit('installAppUpdate')"
        @open-release-page="$emit('openReleasePage')"
      />

      <div
        v-if="onboardingStep === 'complete'"
        class="sticky top-0 z-10 grid grid-cols-2 gap-1 rounded-lg border border-white/5 bg-slate-900/95 p-1 shadow-lg shadow-slate-950/30 backdrop-blur"
        role="group"
        aria-label="Navigation du panneau MemeDrop"
      >
        <Button
          :variant="controlTab === 'control' ? 'tabActive' : 'tab'"
          size="xs"
          :aria-pressed="controlTab === 'control'"
          @click="$emit('updateControlTab', 'control')"
        >
          Contrôle
        </Button>
        <Button
          :variant="controlTab === 'connected' ? 'tabActive' : 'tab'"
          size="xs"
          :aria-pressed="controlTab === 'connected'"
          @click="$emit('updateControlTab', 'connected')"
        >
          Autres utilisateurs ({{ otherConnectedUsers.length }})
        </Button>
      </div>

      <ControlPanel
        v-if="onboardingStep === 'complete' && controlTab === 'control'"
        v-model:server-config="serverConfig"
        :drops-enabled="dropsEnabled"
        :hide-own-drops="hideOwnDrops"
        :can-skip-current-drop="canSkipCurrentDrop"
        :can-stop-global-drop="canStopGlobalDrop"
        :can-trigger-test-drop="canTriggerTestDrop"
        :has-server-drop="hasServerDrop"
        :is-current-server-drop-owner="isCurrentServerDropOwner"
        :pending-drop-action="pendingDropAction"
        :drop-action-error="dropActionError"
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
        :config-save-status="configSaveStatus"
        :auth-message="authMessage"
        :auth-status="authStatus"
        :connection-status="connectionStatus"
        :section-state="controlPanelSectionState"
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
        @update-section="relayControlPanelSection"
      />

      <ConnectedUsersView
        v-if="onboardingStep === 'complete' && controlTab === 'connected'"
        :users="otherConnectedUsers"
        empty-message="Aucun autre utilisateur connecté."
      />
    </main>
  </div>
</template>
