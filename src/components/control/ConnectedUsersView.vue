<script setup lang="ts">
import type { ConnectedUser } from '../../shared/types'

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

    <div v-else class="flex flex-col gap-2">
      <div
        v-for="user in users"
        :key="user.id"
        class="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/70 p-3"
      >
        <img
          v-if="user.avatarUrl"
          :src="user.avatarUrl"
          :alt="`Avatar Discord de ${user.name}`"
          class="h-10 w-10 shrink-0 rounded-full border border-white/20 bg-slate-800 object-cover"
        />
        <div
          v-else
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-800 text-sm font-semibold text-slate-200"
        >
          {{ user.name.slice(0, 1).toUpperCase() }}
        </div>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-slate-100">{{ user.name }}</p>
          <p class="text-[11px] text-slate-400">
            {{ user.connections > 1 ? `${user.connections} connexions` : 'Connecté' }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
