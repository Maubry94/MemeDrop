<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue'
import type {
  AppPreferences,
  AppUpdateState,
  AppVersionInfo,
  ShortcutActionId,
  ShortcutConfig,
  ShortcutStatus,
} from '../../../shared/types'
import AppUpdatePanel from './AppUpdatePanel.vue'
import Button from '../ui/Button.vue'
import Checkbox from '../ui/Checkbox.vue'

const props = defineProps<{
  preferences: AppPreferences
  appUpdateState: AppUpdateState
  appVersionInfo: AppVersionInfo
  shortcutConfigs: ShortcutConfig[]
  shortcutStatuses: ShortcutStatus[]
}>()

const emit = defineEmits<{
  close: []
  checkForAppUpdate: []
  downloadAppUpdate: []
  installAppUpdate: []
  openReleasePage: []
  updatePreferences: [preferences: AppPreferences]
  updateShortcuts: [shortcuts: ShortcutConfig[]]
  startShortcutCapture: [action: ShortcutActionId]
  resetShortcuts: []
  uninstallApp: []
}>()

const editingShortcut = ref<ShortcutActionId | null>(null)
const dialogElement = ref<HTMLElement | null>(null)

let previouslyFocusedElement: HTMLElement | null = null

const fallbackLabels: Record<ShortcutActionId, string> = {
  toggleDrops: 'Désactiver/Activer les drops',
  skipDrop: 'Passer le drop',
  toggleOwnDrops: 'Afficher/masquer mes propres drops',
  stopGlobalDrop: 'Arrêter mon drop',
}

const shortcutStatusesByAction = computed(() =>
  Object.fromEntries(props.shortcutStatuses.map((status) => [status.action, status])) as Partial<
    Record<ShortcutActionId, ShortcutStatus>
  >,
)

const shortcutLabel = (shortcut: ShortcutConfig) =>
  shortcutStatusesByAction.value[shortcut.action]?.label ?? fallbackLabels[shortcut.action]

const shortcutRegistered = (shortcut: ShortcutConfig) =>
  shortcutStatusesByAction.value[shortcut.action]?.registered ?? true

const formatAccelerator = (accelerator: string) =>
  accelerator.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ')

const startEditingShortcut = (action: ShortcutActionId) => {
  editingShortcut.value = action
  emit('startShortcutCapture', action)
}

const getFocusableElements = () => {
  if (!dialogElement.value) {
    return []
  }

  return Array.from(
    dialogElement.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0)
}

const closeDialog = () => {
  emit('close')
}

const handleDialogKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    if (editingShortcut.value) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    closeDialog()
    return
  }

  if (event.key !== 'Tab') {
    return
  }

  const focusableElements = getFocusableElements()
  if (!focusableElements.length) {
    event.preventDefault()
    dialogElement.value?.focus({ preventScroll: true })
    return
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  const activeElement = document.activeElement

  if (event.shiftKey) {
    if (
      activeElement === dialogElement.value ||
      activeElement === firstElement ||
      !dialogElement.value?.contains(activeElement)
    ) {
      event.preventDefault()
      lastElement?.focus()
    }
    return
  }

  if (activeElement === lastElement || activeElement === dialogElement.value) {
    event.preventDefault()
    firstElement?.focus()
  }
}

let unsubscribeShortcutConfigs: (() => void) | undefined
let unsubscribeShortcutCaptureCancelled: (() => void) | undefined

onMounted(() => {
  previouslyFocusedElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null

  unsubscribeShortcutConfigs = window.memedrop?.onShortcutConfigs(() => {
    editingShortcut.value = null
  })
  unsubscribeShortcutCaptureCancelled = window.memedrop?.onShortcutCaptureCancelled(() => {
    editingShortcut.value = null
  })

  void nextTick(() => {
    dialogElement.value?.focus({ preventScroll: true })
  })
})

onBeforeUnmount(() => {
  void window.memedrop?.setShortcutCaptureMode(false)
  unsubscribeShortcutConfigs?.()
  unsubscribeShortcutCaptureCancelled?.()
})

onUnmounted(() => {
  if (previouslyFocusedElement?.isConnected) {
    previouslyFocusedElement.focus({ preventScroll: true })
  }
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
    @click.self="closeDialog"
  >
    <section
      ref="dialogElement"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preferences-dialog-title"
      tabindex="-1"
      class="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-950 text-slate-100 shadow-2xl"
      @keydown="handleDialogKeydown"
    >
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 p-4">
        <h2 id="preferences-dialog-title" class="text-sm font-semibold">Préférences</h2>
        <Button
          variant="icon"
          size="icon"
          title="Fermer"
          aria-label="Fermer"
          @click="closeDialog"
        >
          <span
            class="size-4 bg-current"
            style="mask: url('/icons/cross.svg') center / contain no-repeat; -webkit-mask: url('/icons/cross.svg') center / contain no-repeat;"
            aria-hidden="true"
          />
        </Button>
      </div>

      <div class="min-h-0 overflow-y-auto overscroll-contain p-4">
      <div class="space-y-3">
        <label
          class="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-white/10 bg-slate-900/70 p-3"
        >
          <span>
            <span class="block text-sm font-semibold text-slate-100">
              Minimiser en arrière-plan
            </span>
            <span class="mt-1 block text-xs leading-5 text-slate-400">
              La croix cache MemeDrop dans la zone de notification au lieu de quitter.
            </span>
          </span>
          <Checkbox
            :model-value="preferences.minimizeToTray"
            @update:model-value="
              $emit('updatePreferences', {
                ...preferences,
                minimizeToTray: $event,
              })
            "
          />
        </label>

        <label
          class="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-white/10 bg-slate-900/70 p-3"
        >
          <span>
            <span class="block text-sm font-semibold text-slate-100">
              Démarrer avec Windows
            </span>
            <span class="mt-1 block text-xs leading-5 text-slate-400">
              Lance MemeDrop automatiquement à l'ouverture de session Windows.
            </span>
          </span>
          <Checkbox
            :model-value="preferences.openAtLogin"
            @update:model-value="
              $emit('updatePreferences', {
                ...preferences,
                openAtLogin: $event,
              })
            "
          />
        </label>
      </div>

      <div class="mt-5 border-t border-white/10 pt-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs font-semibold text-slate-300">Raccourcis clavier</p>
          <Button
            size="xs"
            @click="$emit('resetShortcuts')"
          >
            Réinitialiser
          </Button>
        </div>

        <div class="mt-2 divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-slate-900/70">
          <div
            v-for="shortcut in shortcutConfigs"
            :key="shortcut.action"
            class="px-3 py-2.5"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-xs font-semibold text-slate-100">
                  {{ shortcutLabel(shortcut) }}
                </p>
                <p
                  v-if="!shortcutRegistered(shortcut) || editingShortcut === shortcut.action"
                  class="mt-0.5 text-xs"
                  :class="shortcutRegistered(shortcut) ? 'text-slate-400' : 'text-rose-300'"
                  :role="editingShortcut === shortcut.action ? 'status' : undefined"
                  :aria-live="editingShortcut === shortcut.action ? 'polite' : undefined"
                >
                  {{ editingShortcut === shortcut.action ? 'Saisis un raccourci — Échap pour annuler.' : 'Indisponible' }}
                </p>
              </div>

              <Button
                class="shrink-0"
                variant="subtle"
                size="xs"
                :aria-label="editingShortcut === shortcut.action
                  ? `${shortcutLabel(shortcut)} : saisis un raccourci, Échap pour annuler`
                  : `Modifier ${shortcutLabel(shortcut)} (${formatAccelerator(shortcut.accelerator)})`"
                @click="startEditingShortcut(shortcut.action)"
              >
                {{
                  editingShortcut === shortcut.action
                    ? 'Saisie…'
                    : formatAccelerator(shortcut.accelerator)
                }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-5 border-t border-white/10 pt-4">
        <AppUpdatePanel
          :state="appUpdateState"
          :version-info="appVersionInfo"
          @check="$emit('checkForAppUpdate')"
          @download="$emit('downloadAppUpdate')"
          @install="$emit('installAppUpdate')"
          @open-release-page="$emit('openReleasePage')"
        />
      </div>

      <div class="mt-5 border-t border-rose-400/20 pt-4">
        <p class="text-xs font-semibold text-rose-300">Zone dangereuse</p>
        <Button
          class="mt-2"
          variant="danger"
          full-width
          @click="$emit('uninstallApp')"
        >
          Désinstaller MemeDrop
        </Button>
      </div>
      </div>
    </section>
  </div>
</template>
