<script setup lang="ts">
import type { AppPreferences } from '../../shared/types'

defineProps<{
  preferences: AppPreferences
}>()

defineEmits<{
  close: []
  updatePreferences: [preferences: AppPreferences]
}>()
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
    <section
      class="w-full max-w-sm rounded-lg border border-white/10 bg-slate-950 p-4 text-slate-100 shadow-2xl"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">Préférences</h2>
        <button
          type="button"
          class="rounded-md border border-white/10 bg-slate-900/70 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-900"
          @click="$emit('close')"
        >
          Fermer
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
    </section>
  </div>
</template>
