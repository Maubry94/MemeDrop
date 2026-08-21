<script setup lang="ts">
defineProps<{
  min: number | string
  max: number | string
  step?: number | string
}>()

const modelValue = defineModel<number>({ required: true })
</script>

<template>
  <input
    :value="modelValue"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    class="h-6 w-full cursor-pointer accent-sky-400 outline-none scheme-dark focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
    @input="modelValue = Number(($event.target as HTMLInputElement).value)"
  />
</template>
