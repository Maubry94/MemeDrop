<script setup lang="ts">
import type { ServerConfig } from '../../shared/types'
import ServerSettings from './ServerSettings.vue'

defineProps<{
  isAuthenticating: boolean
  authMessage: string | null
  isSavingConfig: boolean
  configSavedMessage: string | null
}>()

defineEmits<{
  authenticate: []
  saveServerConfig: []
}>()

const serverConfig = defineModel<ServerConfig>({ required: true })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col justify-center gap-4">
    <div class="flex flex-col items-center gap-3 text-center">
      <img src="/memeDrop.png" alt="Logo de MemeDrop" class="size-24 rounded-2xl object-contain" />
      <div>
        <h1 class="text-xl font-semibold text-slate-100">MemeDrop</h1>
        <p class="mt-1 text-xs text-slate-400">Connexion Discord requise.</p>
      </div>
    </div>

    <button
      type="button"
      class="w-full cursor-pointer rounded-lg border border-white/10 bg-indigo-400 px-3 py-3 text-sm font-semibold text-slate-950 hover:bg-indigo-300 disabled:opacity-60"
      :disabled="isAuthenticating"
      @click="$emit('authenticate')"
    >
      {{ isAuthenticating ? 'Connexion…' : 'Se connecter avec Discord' }}
    </button>

    <div v-if="authMessage" class="text-center text-[11px] text-slate-300">
      {{ authMessage }}
    </div>

    <ServerSettings
      v-model="serverConfig"
      :is-saving="isSavingConfig"
      :message="configSavedMessage"
      default-open
      @save="$emit('saveServerConfig')"
    />
  </div>
</template>
