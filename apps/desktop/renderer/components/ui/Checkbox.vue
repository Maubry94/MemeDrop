<script setup lang="ts">
const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <input
    v-model="modelValue"
    type="checkbox"
    class="mt-1 size-4 shrink-0 cursor-pointer rounded accent-sky-400 outline-none scheme-dark focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
  />
</template>
