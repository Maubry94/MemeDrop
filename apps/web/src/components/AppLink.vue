<script setup lang="ts">
withDefaults(defineProps<{
  href: string
  secondary?: boolean
  external?: boolean
}>(), {
  secondary: false,
  external: false,
})
</script>

<template>
  <a
    :href="href"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
    class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors motion-reduce:transition-none"
    :class="secondary
      ? 'border-white/10 bg-slate-900/70 text-slate-100 hover:bg-slate-800'
      : 'border-transparent bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-950 hover:from-sky-300 hover:to-indigo-300'"
  >
    <slot />
    <span v-if="external" class="sr-only"> (nouvel onglet)</span>
  </a>
</template>
