<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ServerConfig } from '../../../shared/types'
import type { ActionFeedbackStatus } from '../../composables/useControlActions'
import { isServerConfigComplete } from '../../composables/controlOnboarding'
import Button from '../ui/Button.vue'
import ServerSettings from './ServerSettings.vue'

const props = defineProps<{
  isAuthenticating: boolean
  authMessage: string | null
  authStatus: ActionFeedbackStatus
  isSavingConfig: boolean
  configSavedMessage: string | null
  configSaveStatus: ActionFeedbackStatus
}>()

const emit = defineEmits<{
  authenticate: []
  saveServerConfig: []
}>()

const serverConfig = defineModel<ServerConfig>({ required: true })
const step = ref<'server' | 'discord'>(
  isServerConfigComplete(serverConfig.value) ? 'discord' : 'server',
)
const waitingForServerSave = ref(false)
const titleElement = ref<HTMLElement | null>(null)

const configuredServerHost = computed(() => {
  try {
    return new URL(serverConfig.value.serverUrl).host
  } catch {
    return serverConfig.value.serverUrl.trim()
  }
})

const focusTitle = async () => {
  await nextTick()
  titleElement.value?.focus({ preventScroll: true })
}

const saveAndContinue = () => {
  waitingForServerSave.value = true
  emit('saveServerConfig')
}

const editServer = () => {
  waitingForServerSave.value = false
  step.value = 'server'
}

watch(
  () => props.configSaveStatus,
  (status) => {
    if (!waitingForServerSave.value || status === 'idle') {
      return
    }

    waitingForServerSave.value = false
    if (status === 'success') {
      step.value = 'discord'
    }
  },
)

watch(
  () => [serverConfig.value.serverUrl, serverConfig.value.accessKey] as const,
  () => {
    if (step.value === 'discord' && !isServerConfigComplete(serverConfig.value)) {
      step.value = 'server'
    }
  },
)

watch(step, () => {
  void focusTitle()
})

onMounted(() => {
  void focusTitle()
})
</script>

<template>
  <section class="mx-auto my-auto flex w-full max-w-sm shrink-0 flex-col gap-5 py-4">
    <div class="flex flex-col items-center gap-3 text-center">
      <img src="/memeDrop.png" alt="" aria-hidden="true" class="size-20 rounded-2xl object-contain" />
      <div>
        <h1
          ref="titleElement"
          tabindex="-1"
          class="text-xl font-semibold text-slate-100 outline-none"
        >
          {{ step === 'server' ? 'Configurer le serveur MemeDrop' : 'Connecter Discord' }}
        </h1>
        <p class="mt-2 text-sm leading-5 text-slate-400">
          <template v-if="step === 'server'">
            Indique l'adresse et la clé fournies par la personne qui héberge MemeDrop.
          </template>
          <template v-else>
            Identifie-toi pour recevoir les drops qui te sont destinés.
          </template>
        </p>
      </div>
    </div>

    <ServerSettings
      v-if="step === 'server'"
      v-model="serverConfig"
      :is-saving="isSavingConfig"
      :message="configSavedMessage"
      :message-status="configSaveStatus"
      :collapsible="false"
      id-prefix="onboarding-server"
      title="Serveur MemeDrop"
      submit-label="Enregistrer et continuer"
      @save="saveAndContinue"
    />

    <template v-else>
      <div class="rounded-lg border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-slate-200">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-emerald-200">Paramètres serveur enregistrés</p>
            <p class="mt-1 truncate text-xs text-slate-400">{{ configuredServerHost }}</p>
          </div>
          <Button variant="subtle" size="xs" @click="editServer">
            Modifier
          </Button>
        </div>
      </div>

      <Button
        variant="discord"
        size="md"
        full-width
        :disabled="isAuthenticating"
        :aria-busy="isAuthenticating"
        @click="$emit('authenticate')"
      >
        {{ isAuthenticating ? 'Connexion à Discord…' : 'Continuer avec Discord' }}
      </Button>

      <div
        v-if="authMessage"
        :role="authStatus === 'error' ? 'alert' : 'status'"
        :aria-live="authStatus === 'error' ? undefined : 'polite'"
        aria-atomic="true"
        class="wrap-break-word text-center text-xs"
        :class="authStatus === 'error' ? 'text-rose-300' : 'text-slate-300'"
      >
        {{ authMessage }}
      </div>
    </template>
  </section>
</template>
