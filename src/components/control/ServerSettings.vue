<script setup lang="ts">
import type { ServerConfig } from '../../../shared/types'
import Button from '../ui/Button.vue'
import Input from '../ui/Input.vue'

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
        <Input
          v-model="serverConfig.serverUrl"
          type="url"
          placeholder="https://memedrop.example.com"
        />
      </label>

      <label class="flex flex-col gap-1">
        Clé d'accès
        <Input
          v-model="serverConfig.accessKey"
          type="password"
          autocomplete="off"
        />
      </label>

      <Button
        type="submit"
        variant="primary"
        full-width
        :disabled="isSaving"
      >
        {{ isSaving ? 'Enregistrement…' : 'Enregistrer le serveur' }}
      </Button>

      <div v-if="message" class="text-[11px] text-slate-300">
        {{ message }}
      </div>
    </form>
  </details>
</template>
