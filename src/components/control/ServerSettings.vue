<script setup lang="ts">
import { computed } from 'vue'
import type { ServerConfig } from '../../../shared/types'
import type { ActionFeedbackStatus } from '../../composables/useControlActions'
import Button from '../ui/Button.vue'
import Input from '../ui/Input.vue'

const props = withDefaults(
  defineProps<{
    isSaving: boolean
    message: string | null
    messageStatus?: ActionFeedbackStatus
    defaultOpen?: boolean
    collapsible?: boolean
    idPrefix?: string
    title?: string
    submitLabel?: string
  }>(),
  {
    messageStatus: 'idle',
    defaultOpen: false,
    collapsible: true,
    idPrefix: 'server-settings',
    title: 'Paramètres serveur',
    submitLabel: 'Enregistrer le serveur',
  },
)

defineEmits<{
  save: []
}>()

const serverConfig = defineModel<ServerConfig>({ required: true })

const containerTag = computed(() => (props.collapsible ? 'details' : 'section'))
const containerAttributes = computed(() =>
  props.collapsible
    ? { open: props.defaultOpen }
    : { 'aria-labelledby': `${props.idPrefix}-title` },
)

const messageRole = computed(() =>
  props.messageStatus === 'error' ? 'alert' : 'status',
)
</script>

<template>
  <component
    :is="containerTag"
    v-bind="containerAttributes"
    class="rounded-lg border border-white/10 bg-slate-900/70 p-3 text-xs text-slate-300"
  >
    <summary
      v-if="collapsible"
      class="cursor-pointer rounded-sm font-semibold text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      {{ title }}
    </summary>
    <h2 v-else :id="`${idPrefix}-title`" class="font-semibold text-slate-100">
      {{ title }}
    </h2>

    <form :class="['flex flex-col gap-3', collapsible ? 'mt-3' : 'mt-4']" @submit.prevent="$emit('save')">
      <label :for="`${idPrefix}-url`" class="flex flex-col gap-1">
        URL du serveur MemeDrop
        <Input
          :id="`${idPrefix}-url`"
          v-model="serverConfig.serverUrl"
          type="url"
          placeholder="https://memedrop.example.com"
          autocomplete="url"
          autocapitalize="none"
          spellcheck="false"
          required
          :disabled="isSaving"
        />
      </label>

      <label :for="`${idPrefix}-key`" class="flex flex-col gap-1">
        Clé d'accès au serveur
        <Input
          :id="`${idPrefix}-key`"
          v-model="serverConfig.accessKey"
          type="password"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          required
          minlength="16"
          :aria-describedby="`${idPrefix}-key-help`"
          :disabled="isSaving"
        />
        <span :id="`${idPrefix}-key-help`" class="text-xs text-slate-400">
          16 caractères minimum.
        </span>
      </label>

      <Button
        type="submit"
        variant="primary"
        full-width
        :disabled="isSaving"
        :aria-busy="isSaving"
      >
        {{ isSaving ? 'Enregistrement…' : submitLabel }}
      </Button>

      <div
        v-if="message"
        :role="messageRole"
        :aria-live="messageStatus === 'error' ? undefined : 'polite'"
        aria-atomic="true"
        class="text-xs"
        :class="messageStatus === 'error' ? 'text-rose-300' : 'text-emerald-300'"
      >
        {{ message }}
      </div>
    </form>
  </component>
</template>
