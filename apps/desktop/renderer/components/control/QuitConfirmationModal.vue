<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import Button from '../ui/Button.vue'

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const dialogElement = ref<HTMLElement | null>(null)
let previouslyFocusedElement: HTMLElement | null = null

const getFocusableElements = () => {
  if (!dialogElement.value) return []

  return Array.from(
    dialogElement.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('cancel')
    return
  }

  if (event.key !== 'Tab') return

  const focusableElements = getFocusableElements()
  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  const activeElement = document.activeElement

  if (!firstElement || !lastElement) {
    event.preventDefault()
    dialogElement.value?.focus({ preventScroll: true })
    return
  }

  const focusIsOutsideDialog = !dialogElement.value?.contains(activeElement)

  if (
    event.shiftKey &&
    (activeElement === firstElement || activeElement === dialogElement.value || focusIsOutsideDialog)
  ) {
    event.preventDefault()
    lastElement.focus()
  } else if (
    !event.shiftKey &&
    (activeElement === lastElement || activeElement === dialogElement.value || focusIsOutsideDialog)
  ) {
    event.preventDefault()
    firstElement.focus()
  }
}

onMounted(() => {
  previouslyFocusedElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null

  void nextTick(() => {
    dialogElement.value
      ?.querySelector<HTMLButtonElement>('[data-quit-cancel]')
      ?.focus({ preventScroll: true })
  })
})

onUnmounted(() => {
  if (previouslyFocusedElement?.isConnected) {
    previouslyFocusedElement.focus({ preventScroll: true })
  }
})
</script>

<template>
  <div
    class="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-4"
    @click.self="$emit('cancel')"
  >
    <section
      ref="dialogElement"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="quit-dialog-title"
      aria-describedby="quit-dialog-description"
      tabindex="-1"
      class="w-full max-w-sm rounded-xl border border-white/10 bg-slate-950 p-4 text-slate-100 shadow-2xl"
      @keydown="handleKeydown"
    >
      <div class="flex items-center gap-3">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-200"
          aria-hidden="true"
        >
          <span
            class="size-5 bg-current"
            style="mask: url('/icons/power.svg') center / contain no-repeat; -webkit-mask: url('/icons/power.svg') center / contain no-repeat;"
          />
        </span>
        <h2 id="quit-dialog-title" class="text-base font-semibold">
          Quitter MemeDrop ?
        </h2>
      </div>
      <p id="quit-dialog-description" class="mt-3 text-sm leading-6 text-slate-300">
        Les drops ne s’afficheront plus sur cet appareil tant que MemeDrop n’est pas relancé.
      </p>

      <div class="mt-5 flex flex-col-reverse gap-2 min-[380px]:flex-row min-[380px]:justify-end">
        <Button
          data-quit-cancel
          variant="subtle"
          @click="$emit('cancel')"
        >
          Annuler
        </Button>
        <Button
          variant="danger"
          @click="$emit('confirm')"
        >
          Quitter
        </Button>
      </div>
    </section>
  </div>
</template>
