<script setup lang="ts">
import type { ConnectedUser } from '../../../shared/types'

defineProps<{
  users: ConnectedUser[]
  emptyMessage?: string
}>()
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col gap-3">
    <div
      v-if="!users.length"
      class="rounded-lg border border-white/10 bg-slate-900/70 p-4 text-center text-xs text-slate-400"
    >
      {{ emptyMessage ?? 'Aucun utilisateur connecté.' }}
    </div>

    <ul v-else class="flex flex-col gap-2" aria-label="Autres utilisateurs connectés">
      <li
        v-for="user in users"
        :key="user.id"
        class="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/70 p-3"
      >
        <img
          v-if="user.avatarUrl"
          :src="user.avatarUrl"
          alt=""
          class="h-10 w-10 shrink-0 rounded-full border border-white/20 bg-slate-800 object-cover"
        />
        <div
          v-else
          aria-hidden="true"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-800 text-sm font-semibold text-slate-200"
        >
          {{ user.name.slice(0, 1).toUpperCase() }}
        </div>

        <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-slate-100">{{ user.name }}</p>
            <p
              v-if="user.connections > 1 || user.appVersions.length"
              class="mt-0.5 truncate text-xs text-slate-400"
              :title="`${user.connections > 1 ? `${user.connections} connexions${user.appVersions.length ? ' · ' : ''}` : ''}${user.appVersions.length ? `version ${user.appVersions.join(', ')}` : ''}`"
            >
              <span v-if="user.connections > 1">{{ user.connections }} connexions</span>
              <span v-if="user.appVersions.length">
                {{ user.connections > 1 ? ' · ' : '' }}version {{ user.appVersions.join(', ') }}
              </span>
            </p>
          </div>

          <span
            class="shrink-0 rounded-full border px-2 py-1 text-xs font-semibold"
            :class="user.dropsEnabled
              ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-300/25 bg-rose-400/10 text-rose-200'"
          >
            {{ user.dropsEnabled ? 'Drop activé' : 'Drop désactivé' }}
          </span>
        </div>
      </li>
    </ul>
  </section>
</template>
