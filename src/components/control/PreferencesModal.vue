<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppPreferences, ShortcutActionId, ShortcutConfig, ShortcutStatus } from '../../../shared/types'
import Button from '../ui/Button.vue'
import Checkbox from '../ui/Checkbox.vue'

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
        <Button
          variant="icon"
          size="icon"
          title="Fermer"
          aria-label="Fermer"
          @click="$emit('close')"
        >
          <span
            class="size-4 bg-current"
            style="mask: url('/icons/cross.svg') center / contain no-repeat; -webkit-mask: url('/icons/cross.svg') center / contain no-repeat;"
            aria-hidden="true"
          />
        </Button>
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

              <Button
                class="shrink-0"
                variant="subtle"
                size="xs"
                @click="startEditingShortcut(shortcut.action)"
              >
                {{
                  editingShortcut === shortcut.action
                    ? 'Appuie...'
                    : formatAccelerator(shortcut.accelerator)
                }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-5 border-t border-rose-400/20 pt-4">
        <p class="text-xs font-semibold text-rose-300">Zone dangereuse</p>
        <Button
          class="mt-2"
          full-width
          @click="$emit('quitApp')"
        >
          Quitter MemeDrop
        </Button>
        <Button
          class="mt-2"
          variant="danger"
          full-width
          @click="$emit('uninstallApp')"
        >
          Désinstaller MemeDrop
        </Button>
      </div>
    </section>
  </div>
</template>
