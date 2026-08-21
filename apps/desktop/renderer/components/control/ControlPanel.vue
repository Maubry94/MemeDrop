<script setup lang="ts">
import { computed } from 'vue'
import type {
  ConnectionStatus,
  ControlPanelSectionId,
  ControlPanelSectionState,
  OverlayDisplayInfo,
  ServerConfig,
  ShortcutStatus,
} from '../../../shared/types'
import type { ActionFeedbackStatus } from '../../composables/useControlActions'
import type { DropAction, DropActionError } from '../../composables/useActiveDrop'
import { getConnectionPresentation } from '../../composables/connectionPresentation'
import { getDropActionPresentation } from '../../composables/dropActionPresentation'
import Button from '../ui/Button.vue'
import Range from '../ui/Range.vue'
import Select from '../ui/Select.vue'
import type { SelectOption } from '../ui/Select.vue'
import DiscordAccount from './DiscordAccount.vue'
import ServerSettings from './ServerSettings.vue'

const props = defineProps<{
  dropsEnabled: boolean
  hideOwnDrops: boolean
  canSkipCurrentDrop: boolean
  canStopGlobalDrop: boolean
  canTriggerTestDrop: boolean
  hasServerDrop: boolean
  isCurrentServerDropOwner: boolean
  pendingDropAction: DropAction | null
  dropActionError: DropActionError | null
  dropVolume: number
  dropSize: number
  isTestDropActive: boolean
  overlayDisplayId: string
  overlayDisplays: OverlayDisplayInfo[]
  overlayPosition: string
  customX: number
  customY: number
  customAnchor: string
  isSavingConfig: boolean
  configSavedMessage: string | null
  configSaveStatus: ActionFeedbackStatus
  authMessage: string | null
  authStatus: ActionFeedbackStatus
  connectionStatus: ConnectionStatus | null
  sectionState: ControlPanelSectionState
  shortcutStatuses: ShortcutStatus[]
}>()

const emit = defineEmits<{
  toggleDrops: []
  skipCurrentDrop: []
  toggleHideOwnDrops: []
  stopCurrentDropForEveryone: []
  updateDropVolume: [value: number]
  updateDropSize: [value: number]
  updateOverlayDisplayId: [value: string]
  updateOverlayPosition: [value: string]
  updateCustomX: [value: number]
  updateCustomY: [value: number]
  updateCustomAnchor: [value: string]
  saveServerConfig: []
  disconnectDiscord: []
  triggerTestDrop: []
  updateSection: [section: ControlPanelSectionId, open: boolean]
}>()

const modelServerConfig = defineModel<ServerConfig>('serverConfig', { required: true })

const getShortcutLabel = (action: ShortcutStatus['action']) => {
  const shortcut = props.shortcutStatuses.find((status) => status.action === action)
  if (!shortcut?.registered) {
    return ''
  }
  return shortcut.accelerator.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ')
}

const getAriaShortcut = (action: ShortcutStatus['action']) => {
  const shortcut = props.shortcutStatuses.find((status) => status.action === action)
  return shortcut?.registered
    ? shortcut.accelerator.replace('CommandOrControl', 'Control')
    : undefined
}

const getShortcutTitle = (action: ShortcutStatus['action'], fallback: string) => {
  const shortcut = getShortcutLabel(action)
  return shortcut ? `${fallback}\nRaccourci : ${shortcut}` : fallback
}

const overlayDisplayOptions = computed<SelectOption[]>(() => [
  { value: 'primary', label: "Toujours l'écran principal" },
  ...props.overlayDisplays.map((display) => ({
    value: display.id,
    label: `${display.label} · ${display.bounds.width}×${display.bounds.height}`,
  })),
])

const overlayPositionOptions: SelectOption[] = [
  { value: 'full', label: "Centre de l'écran" },
  { value: 'top-left', label: 'Haut gauche' },
  { value: 'top-right', label: 'Haut droite' },
  { value: 'bottom-left', label: 'Bas gauche' },
  { value: 'bottom-right', label: 'Bas droite' },
  { value: 'custom', label: 'Personnalisé' },
]

const dropActionPresentation = computed(() => getDropActionPresentation({
  canSkipCurrentDrop: props.canSkipCurrentDrop,
  hasServerDrop: props.hasServerDrop,
  isCurrentServerDropOwner: props.isCurrentServerDropOwner,
  dropsEnabled: props.dropsEnabled,
  isTestDropActive: props.isTestDropActive,
}))
const skipDropDescription = computed(() => dropActionPresentation.value.skipDescription)
const stopDropDescription = computed(() => dropActionPresentation.value.stopDescription)
const previewDisabledReason = computed(() => dropActionPresentation.value.previewDisabledReason)
const pendingActionDescription = computed(() =>
  props.pendingDropAction ? 'Une action est déjà en cours.' : null,
)
const skipDropAssistiveDescription = computed(() =>
  pendingActionDescription.value ?? skipDropDescription.value,
)
const stopDropAssistiveDescription = computed(() =>
  pendingActionDescription.value ?? stopDropDescription.value,
)
const previewAssistiveDescription = computed(() =>
  pendingActionDescription.value ?? previewDisabledReason.value ?? 'Aperçu local.',
)

const connectionPresentation = computed(() => getConnectionPresentation(props.connectionStatus))

const connectionStatusClass = computed(() => ({
  success: 'text-emerald-300',
  progress: 'text-sky-300',
  warning: 'text-amber-300',
  neutral: 'text-slate-400',
  danger: 'text-rose-300',
})[connectionPresentation.value.tone])

const updateSectionState = (section: ControlPanelSectionId, event: Event) => {
  const open = (event.currentTarget as HTMLDetailsElement).open
  if (props.sectionState[section] !== open) {
    emit('updateSection', section, open)
  }
}

</script>

<template>
  <div class="mx-auto grid w-full max-w-5xl items-start gap-3 pb-2 min-[960px]:grid-cols-2">
    <details
      :open="sectionState.dropReception"
      class="group rounded-xl border border-white/10 bg-slate-900/55 shadow-sm"
      aria-labelledby="drop-reception-title"
      @toggle="updateSectionState('dropReception', $event)"
    >
      <summary
        class="cursor-pointer rounded-xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-inset"
      >
        <span class="ml-1 inline-flex min-w-0 max-w-[calc(100%-1.5rem)] items-center justify-between gap-3 align-middle">
          <span
            id="drop-reception-title"
            class="text-sm font-semibold text-slate-100"
            role="heading"
            aria-level="2"
          >
            Réception des drops
          </span>
          <span
            class="shrink-0 rounded-full border px-2 py-1 text-xs font-semibold"
            :class="dropsEnabled
              ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-300/25 bg-rose-400/10 text-rose-200'"
          >
            {{ dropsEnabled ? 'Drop activé' : 'Drop désactivé' }}
          </span>
        </span>
      </summary>

      <div class="grid grid-cols-1 gap-2 border-t border-white/10 p-4 min-[520px]:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-1.5">
          <Button
            full-width
            :aria-keyshortcuts="getAriaShortcut('toggleDrops')"
            :title="getShortcutTitle('toggleDrops', dropsEnabled ? 'Désactiver les drops' : 'Activer les drops')"
            @click="$emit('toggleDrops')"
          >
            {{ dropsEnabled ? 'Désactiver les drops' : 'Activer les drops' }}
          </Button>
        </div>

        <div class="flex min-w-0 flex-col gap-1.5">
          <Button
            full-width
            :aria-keyshortcuts="getAriaShortcut('toggleOwnDrops')"
            :title="getShortcutTitle('toggleOwnDrops', hideOwnDrops ? 'Afficher mes propres drops' : 'Masquer mes propres drops')"
            @click="$emit('toggleHideOwnDrops')"
          >
            {{ hideOwnDrops ? 'Afficher mes propres drops' : 'Masquer mes propres drops' }}
          </Button>
        </div>

        <div class="flex min-w-0 flex-col gap-1.5">
          <Button
            full-width
            :aria-busy="pendingDropAction === 'skip'"
            aria-describedby="skip-drop-description"
            :aria-keyshortcuts="getAriaShortcut('skipDrop')"
            :title="pendingDropAction
              ? pendingActionDescription
              : canSkipCurrentDrop
              ? getShortcutTitle('skipDrop', 'Passer le drop')
              : skipDropDescription"
            :disabled="!canSkipCurrentDrop || pendingDropAction !== null"
            @click="$emit('skipCurrentDrop')"
          >
            {{ pendingDropAction === 'skip' ? 'Passage en cours…' : 'Passer le drop' }}
          </Button>
          <span id="skip-drop-description" class="sr-only">
            {{ skipDropAssistiveDescription }}
          </span>
        </div>

        <div class="flex min-w-0 flex-col gap-1.5">
          <Button
            full-width
            variant="danger"
            :aria-busy="pendingDropAction === 'stop'"
            aria-describedby="stop-drop-description"
            :aria-keyshortcuts="getAriaShortcut('stopGlobalDrop')"
            :title="pendingDropAction
              ? pendingActionDescription
              : canStopGlobalDrop
              ? getShortcutTitle('stopGlobalDrop', 'Arrêter mon drop')
              : stopDropDescription"
            :disabled="!canStopGlobalDrop || pendingDropAction !== null"
            @click="$emit('stopCurrentDropForEveryone')"
          >
            {{ pendingDropAction === 'stop' ? 'Arrêt en cours…' : 'Arrêter mon drop' }}
          </Button>
          <span id="stop-drop-description" class="sr-only">
            {{ stopDropAssistiveDescription }}
          </span>
        </div>
      </div>

      <p
        v-if="dropActionError && dropActionError.action !== 'preview'"
        class="px-4 pb-4 wrap-break-word text-xs text-rose-300"
        role="alert"
      >
        {{ dropActionError.message }}
      </p>
    </details>

    <details
      :open="sectionState.overlayAppearance"
      class="group rounded-xl border border-white/10 bg-slate-900/55 shadow-sm"
      aria-labelledby="overlay-appearance-title"
      @toggle="updateSectionState('overlayAppearance', $event)"
    >
      <summary
        class="cursor-pointer rounded-xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-inset"
      >
        <span
          id="overlay-appearance-title"
          class="ml-1 text-sm font-semibold text-slate-100"
          role="heading"
          aria-level="2"
        >
          Apparence de l'overlay
        </span>
      </summary>

      <div class="border-t border-white/10 p-4">
        <div class="grid gap-4">
          <label class="flex min-w-0 flex-col gap-1 text-xs text-slate-300">
            Écran de l'overlay
            <Select
              :model-value="overlayDisplayId"
              :options="overlayDisplayOptions"
              @update:model-value="$emit('updateOverlayDisplayId', $event)"
            />
          </label>

          <label class="flex min-w-0 flex-col gap-1 text-xs text-slate-300">
            Position de l'overlay
            <Select
              :model-value="overlayPosition"
              :options="overlayPositionOptions"
              @update:model-value="$emit('updateOverlayPosition', $event)"
            />
          </label>

          <label class="flex min-w-0 flex-col gap-2 text-xs text-slate-300">
            <span class="flex items-center justify-between gap-2">
              Taille des drops
              <span class="text-xs text-slate-400">{{ dropSize }}%</span>
            </span>
            <Range
              :model-value="dropSize"
              min="40"
              max="130"
              step="5"
              @update:model-value="$emit('updateDropSize', $event)"
            />
          </label>

          <label class="flex min-w-0 flex-col gap-2 text-xs text-slate-300">
            <span class="flex items-center justify-between gap-2">
              Volume des drops
              <span class="text-xs text-slate-400">{{ dropVolume }}%</span>
            </span>
            <Range
              :model-value="dropVolume"
              min="0"
              max="100"
              step="5"
              @update:model-value="$emit('updateDropVolume', $event)"
            />
          </label>
        </div>

        <div v-if="overlayPosition === 'custom'" class="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 min-[380px]:grid-cols-2">
          <label class="flex flex-col gap-2 text-xs text-slate-300">
            <span class="flex items-center justify-between gap-2">
              Horizontal
              <span class="text-xs text-slate-400">{{ customX }}%</span>
            </span>
            <Range
              :model-value="customX"
              min="0"
              max="100"
              step="1"
              @update:model-value="$emit('updateCustomX', $event)"
            />
          </label>

          <label class="flex flex-col gap-2 text-xs text-slate-300">
            <span class="flex items-center justify-between gap-2">
              Vertical
              <span class="text-xs text-slate-400">{{ customY }}%</span>
            </span>
            <Range
              :model-value="customY"
              min="0"
              max="100"
              step="1"
              @update:model-value="$emit('updateCustomY', $event)"
            />
          </label>
        </div>

        <Button
          class="mt-4"
          full-width
          :variant="isTestDropActive ? 'subtle' : 'primary'"
          :aria-busy="pendingDropAction === 'preview'"
          aria-describedby="preview-description"
          :disabled="!canTriggerTestDrop || pendingDropAction !== null"
          :title="pendingDropAction ? pendingActionDescription : previewDisabledReason ?? undefined"
          @click="$emit('triggerTestDrop')"
        >
          {{ pendingDropAction === 'preview'
            ? 'Mise à jour de l’aperçu…'
            : isTestDropActive
              ? "Fermer l'aperçu"
              : "Afficher l'aperçu" }}
        </Button>
        <span id="preview-description" class="sr-only">
          {{ previewAssistiveDescription }}
        </span>
        <p
          v-if="dropActionError?.action === 'preview'"
          class="mt-2 wrap-break-word text-xs text-rose-300"
          role="alert"
        >
          {{ dropActionError.message }}
        </p>
      </div>
    </details>

    <details
      :open="sectionState.accountAndServer"
      class="group rounded-xl border border-white/10 bg-slate-900/55 shadow-sm min-[960px]:col-span-2"
      @toggle="updateSectionState('accountAndServer', $event)"
    >
      <summary
        class="cursor-pointer rounded-xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-inset"
      >
        <span class="ml-1 inline-flex min-w-0 max-w-[calc(100%-1.5rem)] flex-col align-middle">
          <span class="text-sm font-semibold text-slate-100" role="heading" aria-level="2">
            Compte et serveur
          </span>
          <span
            v-if="connectionPresentation.state !== 'connected'"
            class="mt-1 wrap-break-word text-xs leading-4"
            :class="connectionStatusClass"
          >
            {{ connectionPresentation.message }}
          </span>
        </span>
      </summary>

      <div class="grid items-start gap-3 border-t border-white/10 p-4 min-[760px]:grid-cols-2">
        <div class="min-w-0">
          <DiscordAccount
            :server-config="modelServerConfig"
            :auth-message="authMessage"
            :auth-status="authStatus"
            @disconnect="$emit('disconnectDiscord')"
          />
        </div>

        <div class="min-w-0">
          <ServerSettings
            v-model="modelServerConfig"
            :is-saving="isSavingConfig"
            :message="configSavedMessage"
            :message-status="configSaveStatus"
            :collapsible="false"
            id-prefix="control-server"
            title="Serveur MemeDrop"
            @save="$emit('saveServerConfig')"
          />
        </div>
      </div>
    </details>
  </div>
</template>
