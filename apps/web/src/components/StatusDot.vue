<script setup lang="ts">
defineProps<{
  tone: 'success' | 'warning' | 'danger' | 'neutral'
}>()
</script>

<template>
  <span
    class="inline-block size-2.5 shrink-0 rounded-full"
    :class="{
      'bg-emerald-400': tone === 'success',
      'bg-amber-300': tone === 'warning',
      'bg-rose-400': tone === 'danger',
      'bg-slate-500': tone === 'neutral',
    }"
    aria-hidden="true"
  />
</template>
