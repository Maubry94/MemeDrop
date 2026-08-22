<script setup lang="ts">
import { computed } from 'vue'
import type { AppUpdateState, AppVersionInfo } from '../../../shared/types'
import { getAppUpdatePresentation } from '../../composables/updatePresentation'
import Button from '../ui/Button.vue'

const props = withDefaults(defineProps<{
  state: AppUpdateState
  versionInfo: AppVersionInfo
  context?: 'banner' | 'preferences'
}>(), {
  context: 'preferences',
})

const emit = defineEmits<{
  check: []
  download: []
  install: []
  openReleasePage: []
}>()

const presentation = computed(() => getAppUpdatePresentation(props.state, props.versionInfo))
const isBanner = computed(() => props.context === 'banner')
const shouldRender = computed(() => !isBanner.value || presentation.value.showBanner)

const panelClass = computed(() => ({
  neutral: 'border-white/10 bg-slate-900/70 text-slate-200',
  info: 'border-sky-300/25 bg-sky-400/10 text-sky-100',
  success: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
  danger: 'border-rose-300/25 bg-rose-400/10 text-rose-100',
})[presentation.value.tone])

const progressStyle = computed(() => ({ width: `${presentation.value.progress ?? 0}%` }))
const announcementRole = computed(() => {
  if (props.state.status === 'downloading') return undefined
  if (
    !isBanner.value
    && !['checking', 'available', 'verifying', 'downloaded', 'error', 'not-available'].includes(
      props.state.status,
    )
  ) {
    return undefined
  }
  return presentation.value.tone === 'danger' ? 'alert' : 'status'
})
const busyActionLabel = computed(() => {
  if (!presentation.value.busy) return null
  if (props.state.status === 'checking') return 'Recherche…'
  if (props.state.status === 'downloading') return 'Téléchargement…'
  return 'Préparation…'
})
const visibleActionLabel = computed(
  () => presentation.value.actionLabel ?? busyActionLabel.value,
)
const actionVariant = computed(() =>
  presentation.value.action === 'download'
    || presentation.value.action === 'install'
    || props.state.status === 'downloading'
    || props.state.status === 'verifying'
    ? 'primary'
    : 'subtle',
)

const runAction = () => {
  if (presentation.value.action === 'install') {
    emit('install')
  } else if (presentation.value.action === 'download') {
    emit('download')
  } else if (presentation.value.action === 'check') {
    emit('check')
  }
}
</script>

<template>
  <section
    v-if="shouldRender"
    class="rounded-lg border p-3"
    :class="panelClass"
    :aria-label="isBanner ? 'Mise à jour de MemeDrop' : 'À propos de MemeDrop'"
    :aria-busy="presentation.busy"
  >
    <p v-if="!isBanner" class="text-xs font-semibold text-slate-300">À propos</p>
    <div
      :role="announcementRole"
      :aria-live="announcementRole === 'status' ? 'polite' : undefined"
      aria-atomic="true"
    >
      <p class="font-semibold" :class="isBanner ? 'text-xs' : 'mt-2 text-sm'">
        {{ presentation.title }}
      </p>
      <p class="mt-1 wrap-break-word text-xs leading-5 opacity-80">
        {{ presentation.message }}
      </p>
    </div>

    <div
      v-if="presentation.progress !== null"
      class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-950/40"
      role="progressbar"
      aria-label="Téléchargement de la mise à jour"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="presentation.progress"
      :aria-valuetext="`${presentation.progress} % téléchargés`"
    >
      <div
        class="h-full rounded-full bg-sky-300 transition-[width] motion-reduce:transition-none"
        :style="progressStyle"
      />
    </div>
    <div
      v-else-if="presentation.busy"
      class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-950/40"
      aria-hidden="true"
    >
      <div class="h-full w-full animate-pulse rounded-full bg-sky-300/70 motion-reduce:animate-none" />
    </div>

    <div v-if="visibleActionLabel || (!isBanner && versionInfo.releaseUrl)" class="mt-3 flex flex-wrap gap-2">
      <Button
        v-if="visibleActionLabel"
        :variant="actionVariant"
        size="xs"
        :disabled="presentation.busy"
        :aria-busy="presentation.busy"
        @click="runAction"
      >
        {{ visibleActionLabel }}
      </Button>
      <Button
        v-if="!isBanner && versionInfo.releaseUrl"
        variant="subtle"
        size="xs"
        @click="$emit('openReleasePage')"
      >
        Notes de version
      </Button>
    </div>
  </section>
</template>
