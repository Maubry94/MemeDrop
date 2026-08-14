<script setup lang="ts">
import type { ServerConfig } from '../../../shared/types'
import type { ActionFeedbackStatus } from '../../composables/useControlActions'
import Button from '../ui/Button.vue'

defineProps<{
  serverConfig: ServerConfig
  authMessage: string | null
  authStatus: ActionFeedbackStatus
}>()

defineEmits<{
  disconnect: []
}>()
</script>

<template>
  <div class="flex flex-col gap-2 rounded-lg border border-white/10 bg-slate-900/70 p-3">
    <div v-if="serverConfig.discordUserId" class="flex items-center gap-3 text-xs text-slate-300">
      <img
        v-if="serverConfig.discordUserAvatarUrl"
        :src="serverConfig.discordUserAvatarUrl"
        alt=""
        class="h-8 w-8 shrink-0 rounded-full border border-white/20 bg-slate-800 object-cover"
      />
      <div
        v-else
        aria-hidden="true"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-800 text-xs font-semibold text-slate-200"
      >
        {{ serverConfig.discordUserName.slice(0, 1).toUpperCase() }}
      </div>
      <span>Connecté à Discord en tant que <strong>{{ serverConfig.discordUserName }}</strong></span>
    </div>
    <Button
      variant="subtle"
      full-width
      @click="$emit('disconnect')"
    >
      Déconnecter Discord
    </Button>
    <div
      v-if="authMessage"
      class="wrap-break-word text-xs"
      :class="authStatus === 'error' ? 'text-rose-300' : 'text-slate-300'"
      :role="authStatus === 'error' ? 'alert' : 'status'"
      :aria-live="authStatus === 'error' ? undefined : 'polite'"
      aria-atomic="true"
    >
      {{ authMessage }}
    </div>
  </div>
</template>
