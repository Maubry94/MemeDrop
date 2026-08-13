<script setup lang="ts">
import { computed } from 'vue'
import type {
  ConnectionStatus,
  OverlayDisplayInfo,
  ServerConfig,
  ShortcutStatus,
} from '../../../shared/types'
import Button from '../ui/Button.vue'
import Range from '../ui/Range.vue'
import Select from '../ui/Select.vue'
import type { SelectOption } from '../ui/Select.vue'
import DiscordAccount from './DiscordAccount.vue'
import ServerSettings from './ServerSettings.vue'

const props = defineProps<{
  dropsEnabled: boolean
  hideOwnDrops: boolean
  canStopGlobalDrop: boolean
  canTriggerTestDrop: boolean
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
  authMessage: string | null
  connectionStatus: ConnectionStatus | null
  shortcutStatuses: ShortcutStatus[]
}>()

defineEmits<{
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
}>()

const modelServerConfig = defineModel<ServerConfig>('serverConfig', { required: true })

const getShortcutLabel = (action: ShortcutStatus['action']) => {
  const shortcut = props.shortcutStatuses.find((status) => status.action === action)
  return shortcut?.accelerator.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ') ?? ''
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
  { value: 'full', label: 'Plein écran (centré)' },
  { value: 'top-left', label: 'Haut gauche' },
  { value: 'top-right', label: 'Haut droite' },
  { value: 'bottom-left', label: 'Bas gauche' },
  { value: 'bottom-right', label: 'Bas droite' },
  { value: 'custom', label: 'Personnalisé' },
]
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <Button
      :title="getShortcutTitle('toggleDrops', dropsEnabled ? 'Désactiver les drops' : 'Activer les drops')"
      @click="$emit('toggleDrops')"
    >
      {{ dropsEnabled ? 'Désactiver' : 'Activer' }}
    </Button>
    <Button
      :title="getShortcutTitle('skipDrop', 'Masquer le drop actuel')"
      @click="$emit('skipCurrentDrop')"
    >
      Masquer
    </Button>
    <Button
      :title="getShortcutTitle('toggleOwnDrops', hideOwnDrops ? 'Voir mes drops' : 'Masquer mes drops')"
      @click="$emit('toggleHideOwnDrops')"
    >
      {{ hideOwnDrops ? 'Voir mes drops' : 'Masquer mes drops' }}
    </Button>
    <Button
      :title="getShortcutTitle('stopGlobalDrop', 'Stopper le drop envoyé')"
      :disabled="!canStopGlobalDrop"
      @click="$emit('stopCurrentDropForEveryone')"
    >
      Stopper
    </Button>
  </div>

  <p class="-mt-1 text-[11px] text-slate-500">
    Les raccourcis sont modifiables dans les préférences.
  </p>

  <label class="flex flex-col gap-1 text-xs text-slate-300">
    Écran de l'overlay
    <Select
      :model-value="overlayDisplayId"
      :options="overlayDisplayOptions"
      @update:model-value="$emit('updateOverlayDisplayId', $event)"
    />
  </label>

  <label class="flex flex-col gap-1 text-xs text-slate-300">
    Position de l'overlay
    <Select
      :model-value="overlayPosition"
      :options="overlayPositionOptions"
      @update:model-value="$emit('updateOverlayPosition', $event)"
    />
  </label>

  <label class="flex flex-col gap-2 text-xs text-slate-300">
    <span class="flex items-center justify-between gap-2">
      Taille des drops
      <span class="text-[11px] text-slate-400">{{ dropSize }}%</span>
    </span>
    <Range
      :model-value="dropSize"
      min="40"
      max="130"
      step="5"
      @update:model-value="$emit('updateDropSize', $event)"
    />
  </label>

  <div v-if="overlayPosition === 'custom'" class="grid grid-cols-2 gap-3">
    <label class="flex flex-col gap-2 text-xs text-slate-300">
      <span class="flex items-center justify-between gap-2">
        Horizontal
        <span class="text-[11px] text-slate-400">{{ customX }}%</span>
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
        <span class="text-[11px] text-slate-400">{{ customY }}%</span>
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

  <label class="flex flex-col gap-2 text-xs text-slate-300">
    <span class="flex items-center justify-between gap-2">
      Volume des drops
      <span class="text-[11px] text-slate-400">{{ dropVolume }}%</span>
    </span>
    <Range
      :model-value="dropVolume"
      min="0"
      max="100"
      step="5"
      @update:model-value="$emit('updateDropVolume', $event)"
    />
  </label>

  <ServerSettings
    v-model="modelServerConfig"
    :is-saving="isSavingConfig"
    :message="configSavedMessage"
    @save="$emit('saveServerConfig')"
  />

  <DiscordAccount
    :server-config="modelServerConfig"
    :auth-message="authMessage"
    @disconnect="$emit('disconnectDiscord')"
  />

  <div
    class="text-[11px]"
    :class="connectionStatus?.level === 'error' ? 'text-rose-300' : 'text-emerald-300'"
  >
    {{ connectionStatus?.message ?? 'Serveur MemeDrop : en attente de connexion…' }}
  </div>

  <Button
    class="mt-auto"
    full-width
    :disabled="!canTriggerTestDrop"
    :title="!canTriggerTestDrop ? 'Un drop serveur est déjà en cours.' : undefined"
    @click="$emit('triggerTestDrop')"
  >
    {{ isTestDropActive ? "Masquer l'aperçu" : 'Tester un drop' }}
  </Button>
</template>
