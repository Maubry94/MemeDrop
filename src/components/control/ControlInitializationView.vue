<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ControlInitializationStatus } from '../../composables/useMemedropBridge'
import Button from '../ui/Button.vue'

const props = defineProps<{
  status: Exclude<ControlInitializationStatus, 'ready'>
  errorMessage: string | null
}>()

defineEmits<{
  retry: []
}>()

const errorTitle = ref<HTMLElement | null>(null)

watch(
  () => props.status,
  async (status) => {
    if (status !== 'error') {
      return
    }
    await nextTick()
    errorTitle.value?.focus({ preventScroll: true })
  },
  { immediate: true },
)
</script>

<template>
  <section
    v-if="status === 'initializing'"
    class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <img src="/memeDrop.png" alt="" aria-hidden="true" class="size-20 rounded-2xl object-contain" />
    <span
      class="size-7 animate-spin rounded-full border-2 border-slate-700 border-t-sky-300 motion-reduce:animate-none"
      aria-hidden="true"
    />
    <div>
      <h1 class="text-lg font-semibold text-slate-100">Chargement de MemeDrop…</h1>
      <p class="mt-1 text-xs text-slate-400">Récupération de tes préférences et de ta session.</p>
    </div>
  </section>

  <section
    v-else
    class="mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 text-center"
  >
    <div class="flex size-12 items-center justify-center rounded-full bg-rose-400/10 text-2xl text-rose-300" aria-hidden="true">
      !
    </div>
    <div>
      <h1
        ref="errorTitle"
        tabindex="-1"
        class="text-lg font-semibold text-slate-100 outline-none"
      >
        MemeDrop n'a pas pu démarrer
      </h1>
      <p id="initialization-error-message" class="mt-2 text-sm leading-5 text-slate-400" role="alert" aria-atomic="true">
        {{ errorMessage ?? "L'état de l'application n'a pas pu être chargé." }}
      </p>
    </div>
    <Button
      variant="primary"
      size="md"
      aria-describedby="initialization-error-message"
      @click="$emit('retry')"
    >
      Réessayer le chargement
    </Button>
  </section>
</template>
