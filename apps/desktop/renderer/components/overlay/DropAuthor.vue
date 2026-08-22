<script setup lang="ts">
defineProps<{
  author: string
  avatarUrl: string | null
  isAnonymous?: boolean
}>()
</script>

<template>
  <div class="flex min-w-0 items-center gap-2 text-sm text-slate-300">
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      alt=""
      aria-hidden="true"
      class="h-8 w-8 shrink-0 rounded-full border border-white/20 bg-slate-800 object-cover"
    />
    <div
      v-else-if="isAnonymous"
      aria-hidden="true"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-800 text-base font-semibold text-slate-100"
    >
      ?
    </div>
    <div
      v-else
      aria-hidden="true"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-800 text-xs font-semibold text-slate-200"
    >
      {{ author.slice(0, 1).toUpperCase() }}
    </div>
    <span class="min-w-0 truncate">
      {{ isAnonymous ? 'Envoyé anonymement' : `Envoyé par ${author}` }}
    </span>
  </div>
</template>
