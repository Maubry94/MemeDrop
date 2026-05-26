<script setup lang="ts">
defineProps<{
  author: string
  avatarUrl: string | null
}>()
</script>

<template>
  <div class="flex items-center gap-3 text-base text-slate-300">
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      :alt="`Avatar Discord de ${author}`"
      class="h-10 w-10 shrink-0 rounded-full border border-white/20 bg-slate-800 object-cover"
    />
    <div
      v-else
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-800 text-sm font-semibold text-slate-200"
    >
      {{ author.slice(0, 1).toUpperCase() }}
    </div>
    <span>Envoyé par {{ author }}</span>
  </div>
</template>
