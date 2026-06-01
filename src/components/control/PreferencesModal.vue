<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppPreferences, ShortcutActionId, ShortcutConfig, ShortcutStatus } from '../../../shared/types'

const props = defineProps<{
  preferences: AppPreferences
  shortcutConfigs: ShortcutConfig[]
  shortcutStatuses: ShortcutStatus[]
}>()

const emit = defineEmits<{
  close: []
  updatePreferences: [preferences: AppPreferences]
  updateShortcuts: [shortcuts: ShortcutConfig[]]
  startShortcutCapture: [action: ShortcutActionId]
  resetShortcuts: []
  quitApp: []
  uninstallApp: []
}>()

const editingShortcut = ref<ShortcutActionId | null>(null)

const fallbackLabels: Record<ShortcutActionId, string> = {
  toggleDrops: 'Activer/désactiver les drops',
  skipDrop: 'Masquer le drop actuel',
  toggleOwnDrops: 'Afficher/masquer mes drops',
  stopGlobalDrop: 'Stopper le drop envoyé',
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

let unsubscribeShortcutConfigs: (() => void) | undefined
let unsubscribeShortcutCaptureCancelled: (() => void) | undefined

onMounted(() => {
  unsubscribeShortcutConfigs = window.memedrop?.onShortcutConfigs(() => {
    editingShortcut.value = null
  })
  unsubscribeShortcutCaptureCancelled = window.memedrop?.onShortcutCaptureCancelled(() => {
    editingShortcut.value = null
  })
})

onBeforeUnmount(() => {
  void window.memedrop?.setShortcutCaptureMode(false)
  unsubscribeShortcutConfigs?.()
  unsubscribeShortcutCaptureCancelled?.()
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
    <section
      class="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-lg border border-white/10 bg-slate-950 p-4 text-slate-100 shadow-2xl"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">Préférences</h2>
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-md border border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900"
          title="Fermer"
          aria-label="Fermer"
          @click="$emit('close')"
        >
          <span
            class="size-4 bg-current"
            style="mask: url('/icons/cross.svg') center / contain no-repeat; -webkit-mask: url('/icons/cross.svg') center / contain no-repeat;"
            aria-hidden="true"
          />
        </button>
      </div>

      <div class="mt-4 space-y-3">
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
          <input
            :checked="preferences.minimizeToTray"
            type="checkbox"
            class="mt-1 h-4 w-4 accent-sky-400"
            @change="
              $emit('updatePreferences', {
                ...preferences,
                minimizeToTray: ($event.target as HTMLInputElement).checked,
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
          <input
            :checked="preferences.openAtLogin"
            type="checkbox"
            class="mt-1 h-4 w-4 accent-sky-400"
            @change="
              $emit('updatePreferences', {
                ...preferences,
                openAtLogin: ($event.target as HTMLInputElement).checked,
              })
            "
          />
        </label>
      </div>

      <div class="mt-5 border-t border-white/10 pt-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs font-semibold text-slate-300">Raccourcis clavier</p>
          <button
            type="button"
            class="rounded-md border border-white/10 bg-slate-900/70 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-900"
            @click="$emit('resetShortcuts')"
          >
            Réinitialiser
          </button>
        </div>

        <div class="mt-2 space-y-2">
          <div
            v-for="shortcut in shortcutConfigs"
            :key="shortcut.action"
            class="rounded-lg border border-white/10 bg-slate-900/70 p-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-xs font-semibold text-slate-100">
                  {{ shortcutLabel(shortcut) }}
                </p>
                <p
                  class="mt-0.5 text-[11px]"
                  :class="shortcutRegistered(shortcut) ? 'text-slate-400' : 'text-rose-300'"
                >
                  {{ shortcutRegistered(shortcut) ? 'Disponible' : 'Indisponible' }}
                </p>
              </div>

              <button
                type="button"
                class="shrink-0 rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-900"
                @click="startEditingShortcut(shortcut.action)"
              >
                {{
                  editingShortcut === shortcut.action
                    ? 'Appuie...'
                    : formatAccelerator(shortcut.accelerator)
                }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-5 border-t border-rose-400/20 pt-4">
        <p class="text-xs font-semibold text-rose-300">Zone dangereuse</p>
        <button
          type="button"
          class="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900"
          @click="$emit('quitApp')"
        >
          Quitter MemeDrop
        </button>
        <button
          type="button"
          class="mt-2 w-full rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
          @click="$emit('uninstallApp')"
        >
          Désinstaller MemeDrop
        </button>
      </div>
    </section>
  </div>
</template>
