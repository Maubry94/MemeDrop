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
    class="w-full accent-sky-400"
    @input="modelValue = Number(($event.target as HTMLInputElement).value)"
  />
</template>
