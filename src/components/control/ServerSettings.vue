<script setup lang="ts">
import type { ServerConfig } from '../../../shared/types'

defineProps<{
  isSaving: boolean
  message: string | null
  defaultOpen?: boolean
}>()

defineEmits<{
  save: []
}>()

const serverConfig = defineModel<ServerConfig>({ required: true })
</script>

<template>
  <details
    class="rounded-lg border border-white/10 bg-slate-900/70 p-3 text-xs text-slate-300"
    :open="defaultOpen"
  >
    <summary class="cursor-pointer font-semibold text-slate-200">Paramètres serveur</summary>
    <form class="mt-3 flex flex-col gap-3" @submit.prevent="$emit('save')">
      <label class="flex flex-col gap-1">
        URL du serveur
        <input
          v-model="serverConfig.serverUrl"
          type="url"
          placeholder="https://memedrop.example.com"
          class="w-full rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-sm text-slate-100"
        />
      </label>

      <label class="flex flex-col gap-1">
        Clé d'accès
        <input
          v-model="serverConfig.accessKey"
          type="password"
          autocomplete="off"
          class="w-full rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-sm text-slate-100"
        />
      </label>

      <button
        type="submit"
        class="w-full cursor-pointer rounded-lg border border-white/10 bg-sky-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-300"
        :disabled="isSaving"
      >
        {{ isSaving ? 'Enregistrement…' : 'Enregistrer le serveur' }}
      </button>

      <div v-if="message" class="text-[11px] text-slate-300">
        {{ message }}
      </div>
    </form>
  </details>
</template>
