<script setup lang="ts">
import type { ConnectionStatus, ServerConfig } from '../../../shared/types'
import DiscordAccount from './DiscordAccount.vue'
import ServerSettings from './ServerSettings.vue'

defineProps<{
  dropsEnabled: boolean
  hideOwnDrops: boolean
  canStopGlobalDrop: boolean
  dropVolume: number
  dropSize: number
  isTestDropActive: boolean
  overlayPosition: string
  customX: number
  customY: number
  customAnchor: string
  isSavingConfig: boolean
  configSavedMessage: string | null
  authMessage: string | null
  connectionStatus: ConnectionStatus | null
}>()

defineEmits<{
  toggleDrops: []
  skipCurrentDrop: []
  toggleHideOwnDrops: []
  stopCurrentDropForEveryone: []
  updateDropVolume: [value: number]
  updateDropSize: [value: number]
  updateOverlayPosition: [value: string]
  updateCustomX: [value: number]
  updateCustomY: [value: number]
  updateCustomAnchor: [value: string]
  saveServerConfig: []
  disconnectDiscord: []
  triggerTestDrop: []
}>()

const modelServerConfig = defineModel<ServerConfig>('serverConfig', { required: true })
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <button
      type="button"
      class="cursor-pointer rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/90"
      @click="$emit('toggleDrops')"
    >
      {{ dropsEnabled ? 'Désactiver' : 'Activer' }}
    </button>
    <button
      type="button"
      class="cursor-pointer rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/90"
      @click="$emit('skipCurrentDrop')"
    >
      Couper
    </button>
    <button
      type="button"
      class="cursor-pointer rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/90"
      @click="$emit('toggleHideOwnDrops')"
    >
      {{ hideOwnDrops ? 'Voir mes drops' : 'Masquer mes drops' }}
    </button>
    <button
      type="button"
      class="cursor-pointer rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/90 disabled:cursor-default disabled:opacity-50"
      :disabled="!canStopGlobalDrop"
      @click="$emit('stopCurrentDropForEveryone')"
    >
      Stop global
    </button>
  </div>

  <label class="flex flex-col gap-1 text-xs text-slate-300">
    Position de l'overlay
    <select
      :value="overlayPosition"
      class="w-full rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-sm text-slate-100"
      @change="$emit('updateOverlayPosition', ($event.target as HTMLSelectElement).value)"
    >
      <option value="full">Plein écran (centré)</option>
      <option value="top-left">Haut gauche</option>
      <option value="top-right">Haut droite</option>
      <option value="bottom-left">Bas gauche</option>
      <option value="bottom-right">Bas droite</option>
      <option value="custom">Personnalisé</option>
    </select>
  </label>

  <label class="flex flex-col gap-2 text-xs text-slate-300">
    <span class="flex items-center justify-between gap-2">
      Taille des drops
      <span class="text-[11px] text-slate-400">{{ dropSize }}%</span>
    </span>
    <input
      :value="dropSize"
      type="range"
      min="40"
      max="130"
      step="5"
      class="w-full accent-sky-400"
      @input="$emit('updateDropSize', Number(($event.target as HTMLInputElement).value))"
    />
  </label>

  <div v-if="overlayPosition === 'custom'" class="grid grid-cols-2 gap-3">
    <label class="flex flex-col gap-2 text-xs text-slate-300">
      <span class="flex items-center justify-between gap-2">
        Horizontal
        <span class="text-[11px] text-slate-400">{{ customX }}%</span>
      </span>
      <input
        :value="customX"
        type="range"
        min="0"
        max="100"
        step="1"
        class="w-full accent-sky-400"
        @input="$emit('updateCustomX', Number(($event.target as HTMLInputElement).value))"
      />
    </label>

    <label class="flex flex-col gap-2 text-xs text-slate-300">
      <span class="flex items-center justify-between gap-2">
        Vertical
        <span class="text-[11px] text-slate-400">{{ customY }}%</span>
      </span>
      <input
        :value="customY"
        type="range"
        min="0"
        max="100"
        step="1"
        class="w-full accent-sky-400"
        @input="$emit('updateCustomY', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
  </div>

  <label class="flex flex-col gap-2 text-xs text-slate-300">
    <span class="flex items-center justify-between gap-2">
      Volume des drops
      <span class="text-[11px] text-slate-400">{{ dropVolume }}%</span>
    </span>
    <input
      :value="dropVolume"
      type="range"
      min="0"
      max="100"
      step="5"
      class="w-full accent-sky-400"
      @input="$emit('updateDropVolume', Number(($event.target as HTMLInputElement).value))"
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

  <div class="rounded-lg border border-white/10 bg-slate-900/70 p-2 text-[11px] text-slate-300">
    Ctrl+Shift+D (désactiver les drop)<br />Ctrl+Shift+S (couper le drop actuel)<br />Ctrl+Shift+M
    (masquer mes drops)<br />Ctrl+Shift+X (stop global auteur)
  </div>

  <button
    type="button"
    class="mt-auto w-full cursor-pointer rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/90"
    @click="$emit('triggerTestDrop')"
  >
    {{ isTestDropActive ? "Masquer l'aperçu" : 'Tester un drop' }}
  </button>
</template>
